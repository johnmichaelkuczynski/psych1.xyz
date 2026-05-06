import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  studentsTable,
  tutorConversationsTable,
  tutorMessagesTable,
} from "@workspace/db";
import {
  GenerateCritiqueAnswerResponse as CritiqueAnswerZ,
  GetTutorConversationResponse as TutorConversationZ,
  SendTutorMessageBody as SendTutorMessageBodyZ,
} from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { attachSession, requireStudent } from "../middlewares/session";
import { moduleById, modules } from "../lib/curriculum";

const router: IRouter = Router();
router.use(attachSession);

const TUTOR_MODEL = "claude-sonnet-4-5";

function courseOverview(): string {
  return modules
    .map(
      (m) =>
        `- Module ${m.number} (${m.id}): ${m.title} [${m.type}, ${m.points} pts]`,
    )
    .join("\n");
}

function buildSystemPrompt(
  moduleId: string,
  studentName: string,
  studentIntro: string | null,
): string {
  const m = moduleById(moduleId);
  if (!m) throw new Error(`Unknown module: ${moduleId}`);
  return `You are the AI Tutor and instructor of record for "Psychology 101: Introduction to Psychology", an online college-level course.

Your role:
- You teach Socratically: ask probing questions, push back on weak or vague answers, and offer counterarguments when a student's reasoning is shallow.
- You are warm, patient, and respectful. You assume no prior psychology background.
- You never write the student's assignment for them. If asked to do so, decline and instead help them think through it themselves.
- Keep replies focused (typically 3–8 short paragraphs). Use plain language.
- Always remain in your role as the psychology instructor.

Course overview (13 modules in order):
${courseOverview()}

CURRENT MODULE — the student is in this module right now:

# ${m.title}
Module type: ${m.type} | Points: ${m.points}

## Module objectives
${m.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## Reading (verbatim from the course text)
${m.reading || "(none beyond the assignment prompt itself)"}

## Assignment prompt (verbatim from the course text)
${m.assignment}

## Model response (instructor's reference — DO NOT show this verbatim to the student before they submit; you may draw on its ideas to guide your questioning)
${m.modelResponse}

Student information:
- Name: ${studentName}
${studentIntro ? `- Self-introduction: ${studentIntro}` : "- Self-introduction: (not yet provided)"}

When greeting a returning student, briefly acknowledge what module they are working on and offer one Socratic question or angle to start. Always finish your turn with a question that invites the student to think further.`;
}

async function getOrCreateConversation(studentId: number, moduleId: string) {
  const existing = await db
    .select()
    .from(tutorConversationsTable)
    .where(
      and(
        eq(tutorConversationsTable.studentId, studentId),
        eq(tutorConversationsTable.moduleId, moduleId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(tutorConversationsTable)
    .values({ studentId, moduleId })
    .returning();
  return inserted[0]!;
}

router.get(
  "/tutor/:moduleId/conversation",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const moduleId = req.params.moduleId;
    if (!moduleById(moduleId)) {
      res.status(404).json({ error: "Unknown module" });
      return;
    }
    const studentId = req.studentId as number;
    const conv = await getOrCreateConversation(studentId, moduleId);
    const msgs = await db
      .select()
      .from(tutorMessagesTable)
      .where(eq(tutorMessagesTable.conversationId, conv.id))
      .orderBy(asc(tutorMessagesTable.createdAt));
    res.json(
      TutorConversationZ.parse({
        id: conv.id,
        moduleId: conv.moduleId,
        messages: msgs,
      }),
    );
  },
);

router.post(
  "/tutor/:moduleId/message",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const moduleId = req.params.moduleId;
    const m = moduleById(moduleId);
    if (!m) {
      res.status(404).json({ error: "Unknown module" });
      return;
    }
    const parsed = SendTutorMessageBodyZ.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const userContent = parsed.data.content.trim();
    if (!userContent) {
      res.status(400).json({ error: "Content cannot be empty" });
      return;
    }
    const studentId = req.studentId as number;

    const studentRows = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId))
      .limit(1);
    const student = studentRows[0]!;

    const conv = await getOrCreateConversation(studentId, moduleId);

    // Persist user message first
    await db.insert(tutorMessagesTable).values({
      conversationId: conv.id,
      role: "user",
      content: userContent,
    });

    // Load full history (including the newly inserted user message)
    const history = await db
      .select()
      .from(tutorMessagesTable)
      .where(eq(tutorMessagesTable.conversationId, conv.id))
      .orderBy(asc(tutorMessagesTable.createdAt));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (data: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let assistantText = "";
    try {
      const stream = anthropic.messages.stream({
        model: TUTOR_MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(moduleId, student.name, student.intro),
        messages: history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          assistantText += event.delta.text;
          send({ content: event.delta.text });
        }
      }
    } catch (err) {
      req.log.error({ err }, "tutor stream error");
      send({ error: "Tutor stream failed. Please try again." });
    }

    if (assistantText.trim()) {
      await db.insert(tutorMessagesTable).values({
        conversationId: conv.id,
        role: "assistant",
        content: assistantText,
      });
    }

    send({ done: true });
    res.end();
  },
);

router.post(
  "/tutor/:moduleId/critique",
  requireStudent,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    const moduleId = req.params.moduleId;
    const m = moduleById(moduleId);
    if (!m) {
      res.status(404).json({ error: "Unknown module" });
      return;
    }
    try {
      const message = await anthropic.messages.create({
        model: TUTOR_MODEL,
        max_tokens: 1024,
        system: `You are generating a deliberately mediocre student answer to a psychology assignment for a critique exercise. The answer should be plausible but contain at least three identifiable weaknesses (e.g. unsupported claims, vague terminology, missing counterargument, conflating correlation and causation, surface-level analysis). Do not signal which parts are weak. Write 200–300 words in the voice of a B-/C+ undergraduate. No headings, no meta-commentary, just the answer.`,
        messages: [
          {
            role: "user",
            content: `Module: ${m.title}\n\nAssignment prompt:\n${m.assignment}\n\nWrite a deliberately mediocre answer for the student to critique.`,
          },
        ],
      });
      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      res.json(CritiqueAnswerZ.parse({ answer: text }));
    } catch (err) {
      req.log.error({ err }, "critique generation failed");
      res
        .status(502)
        .json({ error: "Critique generation failed. Please try again." });
    }
  },
);

export default router;
