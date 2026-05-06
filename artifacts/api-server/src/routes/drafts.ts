import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, assignmentDraftsTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { attachSession, requireStudent } from "../middlewares/session";
import { moduleById } from "../lib/curriculum";

const router: IRouter = Router();
router.use(attachSession);

const MODEL = "claude-sonnet-4-5";

router.get(
  "/drafts/:moduleId",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const rows = await db
      .select()
      .from(assignmentDraftsTable)
      .where(
        and(
          eq(assignmentDraftsTable.studentId, studentId),
          eq(assignmentDraftsTable.moduleId, req.params.moduleId),
        ),
      )
      .limit(1);
    res.json({ draft: rows[0] ?? null });
  },
);

router.post(
  "/drafts/:moduleId",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const studentId = req.studentId as number;
    const moduleId = req.params.moduleId;
    const m = moduleById(moduleId);
    if (!m) {
      res.status(404).json({ error: "Unknown module" });
      return;
    }
    const content = String(
      (req.body as { content?: unknown })?.content ?? "",
    ).trim();
    if (!content) {
      res.status(400).json({ error: "Draft cannot be empty" });
      return;
    }

    const existing = await db
      .select()
      .from(assignmentDraftsTable)
      .where(
        and(
          eq(assignmentDraftsTable.studentId, studentId),
          eq(assignmentDraftsTable.moduleId, moduleId),
        ),
      )
      .limit(1);
    if (existing[0]?.locked) {
      res.status(409).json({
        error: "Draft already submitted for feedback. Only one round allowed.",
      });
      return;
    }

    // Build feedback prompt. Reference standard is the model response, but
    // the AI is instructed not to quote or compare directly.
    const system =
      "You are a psychology instructor giving formative feedback on a student's draft. The student gets ONE round of feedback before they write the final submission. NEVER rewrite the student's work and NEVER suggest specific phrasings. Only describe what to change and why. You have access to the instructor's reference standard for what a proficient response looks like — use it to calibrate your judgment, but DO NOT quote it, paraphrase it, or compare the student's work to it explicitly. Output Markdown with EXACTLY these five H2 headings in this order: '## 1. Does the draft answer the prompt?', '## 2. Is the argument structure clear?', '## 3. Where is the reasoning weak?', '## 4. What is missing?', '## 5. What would I revise first?'. Each section is 2–4 sentences. Keep total under 450 words.";

    const user = `# Module ${m.number}: ${m.title}

## Assignment prompt
${m.assignment}

## Reference standard (for your eyes only — do not quote or compare)
${m.modelResponse}

## Student's draft
${content}`;

    let feedback = "";
    try {
      const result = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user }],
      });
      feedback = result.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
    } catch (err) {
      req.log.error({ err }, "Draft feedback generation failed");
      res
        .status(502)
        .json({ error: "Could not generate feedback right now. Try again." });
      return;
    }

    if (existing[0]) {
      await db
        .update(assignmentDraftsTable)
        .set({
          content,
          feedback,
          feedbackAt: new Date(),
          locked: true,
        })
        .where(eq(assignmentDraftsTable.id, existing[0].id));
    } else {
      await db.insert(assignmentDraftsTable).values({
        studentId,
        moduleId,
        content,
        feedback,
        feedbackAt: new Date(),
        locked: true,
      });
    }

    const final = await db
      .select()
      .from(assignmentDraftsTable)
      .where(
        and(
          eq(assignmentDraftsTable.studentId, studentId),
          eq(assignmentDraftsTable.moduleId, moduleId),
        ),
      )
      .limit(1);
    res.json({ draft: final[0] ?? null });
  },
);

export default router;
