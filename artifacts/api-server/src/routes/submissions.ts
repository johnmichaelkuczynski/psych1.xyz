import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, submissionsTable } from "@workspace/db";
import {
  ListSubmissionsResponseItem as SubmissionZ,
  GetSubmissionForModuleResponse as SubmissionOrNullZ,
} from "@workspace/api-zod";
import { attachSession, requireStudent } from "../middlewares/session";
import { moduleById, modules } from "../lib/curriculum";
import { checkWithGPTZero } from "../lib/gptzero";
import { computeActivityReport } from "../lib/activityReport";
import { logger } from "../lib/logger";
import {
  analyzeProcessWithBaseline,
  foldIntoBaseline,
  type ProcessBaseline,
  type ProcessEvent,
} from "../lib/processForensics";
import { studentsTable } from "@workspace/db";

const router: IRouter = Router();
router.use(attachSession);

router.get(
  "/submissions",
  requireStudent,
  async (req: Request, res: Response) => {
    const studentId = req.studentId as number;
    const rows = await db
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.studentId, studentId))
      .orderBy(desc(submissionsTable.createdAt));
    res.json(rows.map((r) => SubmissionZ.parse(r)));
  },
);

router.post(
  "/submissions",
  requireStudent,
  async (req: Request, res: Response) => {
    const body = req.body as {
      moduleId?: unknown;
      content?: unknown;
      keystrokes?: unknown;
      scoreHistory?: unknown;
      finalAiScore?: unknown;
      finalAiClass?: unknown;
      flaggedOnSubmit?: unknown;
    };
    const moduleId = String(body.moduleId ?? "");
    const content = String(body.content ?? "");
    if (!moduleId) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const targetModule = moduleById(moduleId);
    if (!targetModule) {
      res.status(400).json({ error: "Unknown module" });
      return;
    }
    if (!content.trim()) {
      res.status(400).json({ error: "Content cannot be empty" });
      return;
    }
    const studentId = req.studentId as number;

    // Server-side sequential gating
    const targetIdx = modules.findIndex((m) => m.id === targetModule.id);
    if (targetIdx > 0) {
      const priorIds = modules.slice(0, targetIdx).map((m) => m.id);
      const priorSubs = await db
        .select({ moduleId: submissionsTable.moduleId })
        .from(submissionsTable)
        .where(eq(submissionsTable.studentId, studentId));
      const submitted = new Set(priorSubs.map((s) => s.moduleId));
      const missing = priorIds.filter((id) => !submitted.has(id));
      if (missing.length > 0) {
        res.status(403).json({
          error: `Module ${targetModule.number} is locked. Submit prior modules first: ${missing.join(", ")}`,
        });
        return;
      }
    }

    const keystrokes = Array.isArray(body.keystrokes) ? body.keystrokes : null;
    const scoreHistory = Array.isArray(body.scoreHistory)
      ? body.scoreHistory
      : null;
    // `flaggedOnSubmit` is advisory only — what the live client believed at
    // submit time. The server always re-runs GPTZero and is the source of
    // truth for the persisted aiScore/aiClass/aiStatus.
    const flaggedOnSubmit = !!body.flaggedOnSubmit;

    const activityReport =
      keystrokes && scoreHistory
        ? computeActivityReport(keystrokes, scoreHistory)
        : null;

    // ---- Process forensics (second AI-detection layer) ----
    // Guard: skip entirely on sparse data, otherwise short/empty streams
    // get scored as likelyAI ("no human signals present" reads the same
    // as "robotic"). Persist nulls in that case.
    let processScore: number | null = null;
    let processClass: string | null = null;
    let processFeaturesPayload: Record<string, unknown> | null = null;
    let processFlagsArr: string[] | null = null;
    let nextBaseline: ProcessBaseline | null = null;
    let baselineSnapshotN = 0;

    const events = (keystrokes ?? []) as ProcessEvent[];
    const eligibleForForensics =
      events.length >= 20 && content.length >= 80;
    if (eligibleForForensics) {
      const studentRows = await db
        .select({ processBaseline: studentsTable.processBaseline })
        .from(studentsTable)
        .where(eq(studentsTable.id, studentId))
        .limit(1);
      const baseline =
        (studentRows[0]?.processBaseline as ProcessBaseline | null) ?? null;
      baselineSnapshotN = baseline?.n ?? 0;

      try {
        const analysis = analyzeProcessWithBaseline(events, content, baseline);
        processScore = analysis.processScore;
        processClass = analysis.processClass;
        processFlagsArr = analysis.flags;
        // Stash baseline-adjusted info in processFeatures using __ prefixed
        // keys so the admin renderer can ignore them in the feature loop.
        // This avoids a second migration while still persisting "value vs
        // this student's baseline at the time".
        processFeaturesPayload = {
          ...analysis.features,
          __baselineAdjustedScore: analysis.baselineAdjustedScore,
          __baselineDeviation: analysis.baselineDeviation,
          __baselineSnapshot: baseline?.features ?? null,
          __baselineN: baselineSnapshotN,
        };

        // Fold into baseline ONLY if baseline.n < 2. After 2 submissions the
        // baseline is frozen — deliberate, to prevent slow-drift attacks
        // where a student gradually trains the baseline toward their
        // cheating profile.
        if (baselineSnapshotN < 2) {
          nextBaseline = foldIntoBaseline(baseline, analysis.features);
        }
      } catch (err) {
        logger.warn(
          { err, studentId, moduleId },
          "Process forensics analysis failed",
        );
      }
    }

    const inserted = await db
      .insert(submissionsTable)
      .values({
        studentId,
        moduleId,
        content,
        aiScore: null,
        aiClass: null,
        aiCheckedAt: null,
        aiStatus: "pending",
        keystrokes: keystrokes ?? undefined,
        scoreHistory: scoreHistory ?? undefined,
        activityReport: activityReport ?? undefined,
        flaggedOnSubmit,
        processScore,
        processClass,
        processFeatures: processFeaturesPayload ?? undefined,
        processFlags: processFlagsArr ?? undefined,
      })
      .returning();

    if (nextBaseline) {
      await db
        .update(studentsTable)
        .set({ processBaseline: nextBaseline })
        .where(eq(studentsTable.id, studentId))
        .catch((err) => {
          logger.warn({ err, studentId }, "Baseline update failed");
        });
    }

    const row = inserted[0];
    res.status(201).json(SubmissionZ.parse(row));

    // Authoritative server-side AI check, regardless of any client-side
    // pre-scoring. Runs in the background so the POST returns immediately.
    void runAICheck(row.id, content);
  },
);

router.get(
  "/submissions/module/:moduleId",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const rows = await db
      .select()
      .from(submissionsTable)
      .where(
        and(
          eq(submissionsTable.studentId, studentId),
          eq(submissionsTable.moduleId, req.params.moduleId),
        ),
      )
      .orderBy(desc(submissionsTable.createdAt))
      .limit(1);
    res.json(SubmissionOrNullZ.parse({ submission: rows[0] ?? null }));
  },
);

async function runAICheck(submissionId: number, content: string): Promise<void> {
  try {
    const result = await checkWithGPTZero(content);
    if (result) {
      await db
        .update(submissionsTable)
        .set({
          aiScore: result.aiScore,
          aiClass: result.aiClass,
          aiCheckedAt: new Date(),
          aiStatus: "completed",
        })
        .where(eq(submissionsTable.id, submissionId));
    } else {
      await db
        .update(submissionsTable)
        .set({ aiCheckedAt: new Date(), aiStatus: "failed" })
        .where(eq(submissionsTable.id, submissionId));
    }
  } catch (err) {
    logger.error({ err, submissionId }, "Background AI check crashed");
    await db
      .update(submissionsTable)
      .set({ aiCheckedAt: new Date(), aiStatus: "failed" })
      .where(eq(submissionsTable.id, submissionId))
      .catch(() => {});
  }
}

export default router;
