import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, canvasSessionsTable, studentsTable } from "@workspace/db";
import { attachSession, requireStudent } from "../middlewares/session";
import { checkWithGPTZero } from "../lib/gptzero";
import {
  analyzeProcess,
  type ProcessEvent,
} from "../lib/processForensics";

const router: IRouter = Router();
router.use(attachSession);

async function isAccommodated(studentId: number): Promise<boolean> {
  const rows = await db
    .select({ accommodated: studentsTable.accommodated })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  return !!rows[0]?.accommodated;
}

router.get(
  "/canvas/:moduleId",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const rows = await db
      .select()
      .from(canvasSessionsTable)
      .where(
        and(
          eq(canvasSessionsTable.studentId, studentId),
          eq(canvasSessionsTable.moduleId, req.params.moduleId),
        ),
      )
      .limit(1);
    res.json({ session: rows[0] ?? null });
  },
);

router.post(
  "/canvas/:moduleId/autosave",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const moduleId = req.params.moduleId;
    const body = req.body as {
      content?: unknown;
      keystrokes?: unknown;
      scoreHistory?: unknown;
    };
    const content = typeof body.content === "string" ? body.content : "";
    const keystrokes = Array.isArray(body.keystrokes) ? body.keystrokes : [];
    const scoreHistory = Array.isArray(body.scoreHistory)
      ? body.scoreHistory
      : [];

    await db
      .insert(canvasSessionsTable)
      .values({
        studentId,
        moduleId,
        content,
        keystrokes,
        scoreHistory,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [canvasSessionsTable.studentId, canvasSessionsTable.moduleId],
        set: {
          content,
          keystrokes,
          scoreHistory,
          updatedAt: sql`now()`,
        },
      });
    res.status(204).end();
  },
);

router.post(
  "/canvas/:moduleId/score",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    if (await isAccommodated(studentId)) {
      // Accommodated students never see scores; return neutral.
      res.json({
        aiScore: null,
        aiClass: null,
        sentences: [],
        accommodated: true,
      });
      return;
    }
    const text = String((req.body as { text?: unknown })?.text ?? "").trim();
    if (text.length < 30) {
      res.json({
        aiScore: null,
        aiClass: null,
        sentences: [],
        accommodated: false,
      });
      return;
    }
    const result = await checkWithGPTZero(text);
    if (!result) {
      res.json({
        aiScore: null,
        aiClass: null,
        sentences: [],
        accommodated: false,
      });
      return;
    }
    res.json({
      aiScore: result.aiScore,
      aiClass: result.aiClass,
      sentences: result.sentences,
      accommodated: false,
    });
  },
);

/**
 * Live, throttled writing-process score for the student-facing traffic-light
 * bar. Returns ONLY { score, class } — never features, flags, OR a reason
 * string. Any extra metadata (including "throttled" / "accommodated" /
 * "insufficient") would give sophisticated cheaters a tuning oracle, so
 * every non-result simply returns { score: null, class: null }.
 *
 * The frontend throttles to once per 60 s, but client throttling is
 * advisory — we ALSO enforce a 60 s server-side per-(student, module)
 * window so a scripted client cannot brute-force the oracle.
 */
const lastProcessScoreAt = new Map<string, number>();
const PROCESS_SCORE_WINDOW_MS = 60_000;
const MAX_PROCESS_SCORE_KEYS = 5_000;

router.post(
  "/canvas/:moduleId/processScore",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const neutral = { score: null, class: null };
    if (await isAccommodated(studentId)) {
      res.json(neutral);
      return;
    }
    const key = `${studentId}:${req.params.moduleId}`;
    const now = Date.now();
    const last = lastProcessScoreAt.get(key);
    if (last != null && now - last < PROCESS_SCORE_WINDOW_MS) {
      res.json(neutral);
      return;
    }
    // Mark BEFORE running analysis so a slow analyzer can't be raced.
    lastProcessScoreAt.set(key, now);
    if (lastProcessScoreAt.size > MAX_PROCESS_SCORE_KEYS) {
      const cutoff = now - PROCESS_SCORE_WINDOW_MS;
      for (const [k, v] of lastProcessScoreAt) {
        if (v < cutoff) lastProcessScoreAt.delete(k);
      }
    }
    const body = req.body as { events?: unknown; content?: unknown };
    const events = Array.isArray(body.events)
      ? (body.events as ProcessEvent[])
      : [];
    const content = typeof body.content === "string" ? body.content : "";
    if (events.length < 20 || content.length < 80) {
      res.json(neutral);
      return;
    }
    try {
      const r = analyzeProcess(events, content);
      res.json({ score: r.processScore, class: r.processClass });
    } catch {
      res.json(neutral);
    }
  },
);

export default router;
