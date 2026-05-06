import { Router, type IRouter, type Request, type Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { attachSession, requireStudent } from "../middlewares/session";
import { moduleById } from "../lib/curriculum";

const VALID_ACTIONS = [
  "study-guide",
  "tutorial",
  "podcast",
  "rewrite",
  "read-draft",
] as const;
type Action = (typeof VALID_ACTIONS)[number];

const router: IRouter = Router();
router.use(attachSession);

const TUTOR_MODEL = "claude-sonnet-4-5";

interface PromptPair {
  system: string;
  user: string;
  maxTokens: number;
}

function buildPrompt(
  action: Action,
  m: ReturnType<typeof moduleById>,
  draft: string,
): PromptPair {
  const mod = m!;
  const moduleContext = `Module ${mod.number}: ${mod.title}

## Objectives
${mod.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## Reading
${mod.reading || "(no reading beyond the assignment)"}

## Assignment prompt
${mod.assignment}`;

  switch (action) {
    case "study-guide":
      return {
        system:
          "You are a psychology instructor preparing a concise study guide for a student. Output Markdown. Use these sections in order: '## Key concepts' (5–10 bulleted definitions), '## Core arguments' (the main reasoning moves in the reading), '## Common pitfalls' (3–5 mistakes students typically make on this topic), '## Self-check questions' (5 questions a student should be able to answer). Keep it tight — under 500 words. Do not write the assignment for the student.",
        user: `Create the study guide for this module.\n\n${moduleContext}`,
        maxTokens: 2048,
      };
    case "tutorial":
      return {
        system:
          "You are a psychology instructor giving a step-by-step walkthrough that teaches the material in the reading. Output Markdown. Structure: a 1-paragraph plain-English intro, then 4–6 numbered steps, each with a heading, a 2–4 sentence explanation, and a short example or thought experiment. End with a short paragraph titled '## What to do next' that nudges the student toward the assignment WITHOUT writing any of it for them. Under 700 words.",
        user: `Write the tutorial for this module.\n\n${moduleContext}`,
        maxTokens: 2500,
      };
    case "podcast":
      return {
        system:
          "You are scripting a short audio explainer (a 2–3 minute 'podcast') that a student can listen to while commuting. Write a single-host, conversational script. NO speaker labels, NO stage directions, NO headings, NO Markdown — just the spoken words, in flowing paragraphs. Open with a friendly hook ('Welcome back to Psychology 101…'), explain the core ideas of the reading in plain language, weave in one concrete example, and close by inviting the student to think about the assignment prompt. Aim for roughly 350–450 words.",
        user: `Write the podcast script for this module.\n\n${moduleContext}`,
        maxTokens: 1500,
      };
    case "rewrite":
      return {
        system:
          "You are an editor rewriting a psychology reading for maximum clarity for a first-time undergraduate. Preserve every psychological claim and example from the original — do not add new content or remove ideas. Use shorter sentences, simpler vocabulary, and clearer transitions. Output Markdown. Do not add commentary; output only the rewritten reading.",
        user: `Rewrite this reading for clarity. Keep all the psychological content; just make it easier to follow.\n\n# Original reading\n${mod.reading || "(none)"}\n\n# Module context\n${mod.title}\nObjectives:\n${mod.objectives.map((o) => `- ${o}`).join("\n")}`,
        maxTokens: 2500,
      };
    case "read-draft": {
      const trimmed = draft.trim();
      if (!trimmed) {
        throw new Error("Draft is empty");
      }
      return {
        system:
          "You are the student's psychology instructor giving formative feedback on a draft submission BEFORE they submit. Be honest and specific. Output Markdown with these sections in order: '## What is working' (2–4 bullets), '## What needs work' (2–5 bullets — be concrete: cite the exact phrase or claim that is weak and explain why), '## Questions to push your thinking' (2–3 Socratic questions), '## Suggested next revision step' (one short paragraph — concrete next move). Do NOT rewrite the draft for them. Do NOT supply the actual answer. Under 500 words.",
        user: `Module: ${mod.title}\n\nAssignment prompt:\n${mod.assignment}\n\nStudent draft:\n${trimmed}\n\nProvide formative feedback.`,
        maxTokens: 2048,
      };
    }
    default: {
      const _never: never = action;
      throw new Error(`Unknown action: ${_never}`);
    }
  }
}

router.post(
  "/ai/:moduleId/:action",
  requireStudent,
  async (
    req: Request<{ moduleId: string; action: string }>,
    res: Response,
  ) => {
    const moduleId = req.params.moduleId;
    const m = moduleById(moduleId);
    if (!m) {
      res.status(404).json({ error: "Unknown module" });
      return;
    }
    const action = req.params.action as Action;
    if (!VALID_ACTIONS.includes(action)) {
      res.status(400).json({ error: "Unknown action" });
      return;
    }
    const bodyDraft =
      req.body && typeof (req.body as { draft?: unknown }).draft === "string"
        ? ((req.body as { draft: string }).draft)
        : "";

    let prompt: PromptPair;
    try {
      prompt = buildPrompt(action, m, bodyDraft);
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Bad request" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (data: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = anthropic.messages.stream({
        model: TUTOR_MODEL,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          send({ content: event.delta.text });
        }
      }
    } catch (err) {
      req.log.error({ err }, "ai action stream error");
      send({ error: "AI request failed. Please try again." });
    }

    send({ done: true });
    res.end();
  },
);

export default router;
