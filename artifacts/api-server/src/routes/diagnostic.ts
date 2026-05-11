import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, studentsTable, submissionsTable } from "@workspace/db";
import { modules } from "../lib/curriculum";
import {
  analyzeProcess,
  type ProcessEvent,
} from "../lib/processForensics";

const router: IRouter = Router();

type Check = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
  /** When true, a failure of this check is informational only and should not fail the overall report. */
  optional?: boolean;
};

async function run(
  name: string,
  fn: () => Promise<string | void>,
  opts: { optional?: boolean } = {},
): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return {
      name,
      ok: true,
      ms: Date.now() - start,
      detail: typeof detail === "string" ? detail : undefined,
      optional: opts.optional,
    };
  } catch (e) {
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      optional: opts.optional,
    };
  }
}

function selfBaseUrl(req: Request): string {
  const port = process.env.PORT ?? "8080";
  return `http://127.0.0.1:${port}`;
}

router.get("/diagnostic/system", async (_req: Request, res: Response) => {
  const checks: Check[] = [];

  checks.push(
    await run("Environment: DATABASE_URL", async () => {
      if (!process.env.DATABASE_URL) throw new Error("not set");
      return "set";
    }),
  );
  checks.push(
    await run("Environment: SESSION_SECRET", async () => {
      if (!process.env.SESSION_SECRET) throw new Error("not set");
      return "set";
    }),
  );
  checks.push(
    await run("Environment: AI_INTEGRATIONS_ANTHROPIC_BASE_URL", async () => {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL)
        throw new Error("not set");
      return "set";
    }),
  );
  checks.push(
    await run("Environment: AI_INTEGRATIONS_ANTHROPIC_API_KEY", async () => {
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY)
        throw new Error("not set");
      return "set";
    }),
  );
  checks.push(
    await run(
      "Environment: GPTZERO_API_KEY (optional)",
      async () => {
        if (!process.env.GPTZERO_API_KEY)
          throw new Error("not set — AI-writing detector disabled");
        return "set";
      },
      { optional: true },
    ),
  );

  checks.push(
    await run("Database: connectivity", async () => {
      const r = await db.execute("SELECT 1 as ok");
      const rows = (r as unknown as { rows?: Array<{ ok: number }> }).rows ?? [];
      if (!rows.length) throw new Error("no rows returned");
      return "SELECT 1 ok";
    }),
  );

  checks.push(
    await run("Database: students table reachable", async () => {
      await db.select().from(studentsTable).limit(1);
      return "query ok";
    }),
  );

  checks.push(
    await run("Database: submissions table reachable", async () => {
      await db.select().from(submissionsTable).limit(1);
      return "query ok";
    }),
  );

  checks.push(
    await run("Curriculum: 13 modules loaded", async () => {
      if (modules.length !== 13)
        throw new Error(`expected 13, found ${modules.length}`);
      return `${modules.length} modules`;
    }),
  );

  checks.push(
    await run("Curriculum: every module has required fields", async () => {
      const bad = modules.find(
        (m) =>
          !m.id ||
          !m.title ||
          !m.assignment ||
          !m.objectives?.length ||
          !m.modelResponse,
      );
      if (bad) throw new Error(`module ${bad?.id ?? "?"} missing fields`);
      return "all 13 ok";
    }),
  );

  checks.push(
    await run("API: /api/healthz reachable", async () => {
      const r = await fetch(`${selfBaseUrl(_req)}/api/healthz`);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const j = (await r.json()) as { status?: string };
      if (j.status !== "ok") throw new Error("status != ok");
      return "200 ok";
    }),
  );

  // ---- Process forensics: 2 synthetic end-to-end tests --------------------
  checks.push(
    await run(
      "Process forensics: synthetic transcription scores as likelyAI",
      async () => {
        // 50 bursts of 4 chars at exactly 180 ms apart — robotic uniformity,
        // no deletes, no caret backtracks, no abandoned starts.
        const events: ProcessEvent[] = [];
        let t = 0;
        let pos = 0;
        for (let i = 0; i < 50; i++) {
          events.push({
            t,
            type: "insert",
            pos,
            len: 4,
            charCount: 4,
            caretBefore: pos,
            caretAfter: pos + 4,
            text: "abcd",
            k: "i",
            d: "abcd",
          });
          pos += 4;
          t += 180;
        }
        const finalText = "abcd".repeat(50);
        const r = analyzeProcess(events, finalText);
        if (r.processClass !== "likelyAI")
          throw new Error(
            `expected likelyAI, got ${r.processClass} score=${r.processScore}`,
          );
        if (r.processScore < 65)
          throw new Error(
            `expected score≥65, got ${r.processScore}`,
          );
        return `score=${r.processScore} class=${r.processClass}`;
      },
    ),
  );

  checks.push(
    await run(
      "Process forensics: synthetic composition scores as human",
      async () => {
        // Realistic composition. Each "burst" is a single multi-char insert
        // (matches how a real human-typed editor logs a sustained run of
        // typing as one event), with VARIED inter-burst gaps. Plus:
        //   • 1 abandoned start (60-char tangent → 95% deleted → restart
        //     within 10 chars of the abandon-start caret)
        //   • 4 long caret backtracks (>100 chars), each followed by an
        //     insert at a far-back position (drives front-to-back
        //     linearity well below 0.7)
        //   • 2 structural deletes (≥30 chars OR pos < docLen/2)
        const events: ProcessEvent[] = [];
        let t = 1000;
        let docLen = 0;
        function ins(s: string, gap: number, posOverride?: number) {
          t += gap;
          const pos = posOverride ?? docLen;
          events.push({
            t,
            type: "insert",
            pos,
            len: s.length,
            charCount: s.length,
            caretBefore: pos,
            caretAfter: pos + s.length,
            text: s,
            k: "i",
            d: s,
          });
          if (posOverride == null) docLen += s.length;
          else docLen += s.length; // logical, even for inserts in the middle
        }
        function del(len: number, posOverride?: number) {
          const pos = posOverride ?? docLen;
          events.push({
            t,
            type: "delete",
            pos,
            len,
            caretBefore: pos,
            caretAfter: pos - len,
            k: "d",
            d: String(len),
          });
          docLen -= len;
        }
        function jump(to: number, gap: number) {
          t += gap;
          events.push({
            t,
            type: "caretJump",
            pos: to,
            caretBefore: docLen,
            caretAfter: to,
            k: "m",
          });
        }
        // 8 logical sentences with varied inter-burst pauses.
        ins("Plato's Phaedo opens with Socrates calmly facing his execution.", 0);
        ins(" His friends find this composure baffling — surely death is to be feared.", 2300);
        ins(" Socrates replies that the philosopher has practiced dying all along.", 4100);
        ins(" Philosophy, on his telling, is the soul's gradual release from the body.", 1800);
        // Abandoned start: 60-char tangent → delete most of it → restart near same caret
        const abandonStart = docLen;
        ins(
          " I will now consider an entirely different reading of this dialogue.",
          3200,
        );
        const abandonLen = docLen - abandonStart;
        t += 2400; // pause and re-read
        del(Math.floor(abandonLen * 0.95)); // ≥80% deleted within 60s
        // Restart within 10 chars of the abandon-start caret
        t += 900;
        ins(" On reflection, that line of thought belongs in a later section.", 0, abandonStart + 2);
        // More body
        ins(" The cyclical argument — that opposites generate opposites — comes first.", 2700);
        ins(" Critics rightly note that this proves recurrence, not personal survival.", 4500);
        // 4 long caret backtracks to far-back positions, each with an insert
        for (const target of [40, 90, 160, 220]) {
          jump(target, 2200);
          ins(", however,", 600, target);
        }
        // 2 structural deletes
        // (a) far-back: middle of the doc
        t += 2100;
        del(28, Math.floor(docLen / 3));
        // (b) large delete from the end
        t += 3000;
        del(35);
        ins(" Whatever the verdict, the dialogue rewards close attention.", 1800);

        // Final text deliberately won't match the per-char reconstruction
        // (caret-position semantics differ for middle inserts), so the
        // pauseBeforeNewSentence/Paragraph features skip and the verdict
        // rests on the edit-shape signals — exactly what we want to test.
        const finalText =
          "Plato's Phaedo opens with Socrates calmly facing his execution. " +
          "His friends find this composure baffling. " +
          "Socrates replies that the philosopher has practiced dying all along. " +
          "Philosophy is the soul's gradual release from the body. " +
          "On reflection, that line of thought belongs elsewhere. " +
          "The cyclical argument comes first. " +
          "Critics rightly note that this proves recurrence, not personal survival. " +
          "Whatever the verdict, the dialogue rewards close attention.";
        const r = analyzeProcess(events, finalText);
        if (r.processClass !== "human")
          throw new Error(
            `expected human, got ${r.processClass} score=${r.processScore} flags=${JSON.stringify(r.flags)}`,
          );
        if (r.processScore >= 35)
          throw new Error(
            `expected score<35, got ${r.processScore} flags=${JSON.stringify(r.flags)}`,
          );
        return `score=${r.processScore} class=${r.processClass}`;
      },
    ),
  );

  checks.push(
    await run("Anthropic AI: roundtrip", async () => {
      const { anthropic } = await import("@workspace/integrations-anthropic-ai");
      const m = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 16,
        messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      });
      const text = (m.content[0] as { type: string; text?: string })?.text ?? "";
      return `replied (${text.trim().slice(0, 20)})`;
    }),
  );

  const ok = checks.every((c) => c.ok || c.optional);
  res.json({ ok, checks, generatedAt: new Date().toISOString() });
});

router.post("/diagnostic/functional", async (req: Request, res: Response) => {
  const checks: Check[] = [];
  const base = selfBaseUrl(req);
  const stamp = Date.now();
  const email = `diagnostic+${stamp}@psych101.local`;
  const name = `Diagnostic Bot ${stamp}`;
  let cookie = "";
  let createdStudentId: number | null = null;

  async function api(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any; setCookie: string | null }> {
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const setCookie = r.headers.get("set-cookie");
    let json: any = null;
    if (r.status !== 204) {
      try {
        json = await r.json();
      } catch {
        json = null;
      }
    }
    return { status: r.status, json, setCookie };
  }

  try {
    checks.push(
      await run("Auth: login as diagnostic user", async () => {
        const r = await api("POST", "/auth/login", { email, name });
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        if (!r.setCookie) throw new Error("no session cookie set");
        cookie = r.setCookie.split(";")[0]!;
        createdStudentId = (r.json as { id?: number })?.id ?? null;
        if (!createdStudentId) throw new Error("no student id returned");
        return `student id=${createdStudentId}`;
      }),
    );

    checks.push(
      await run("Auth: /auth/me returns the student", async () => {
        const r = await api("GET", "/auth/me");
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        if (r.json?.student?.email !== email)
          throw new Error("session not recognized");
        return "session recognized";
      }),
    );

    checks.push(
      await run("Progress: initial state is empty", async () => {
        const r = await api("GET", "/progress");
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        const ids: string[] = r.json?.completedModuleIds ?? [];
        if (ids.length !== 0) throw new Error(`expected 0, got ${ids.length}`);
        return "0 completed";
      }),
    );

    checks.push(
      await run("Progress: save intro", async () => {
        const r = await api("POST", "/progress/intro", {
          intro: "diagnostic bot intro",
        });
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        if (r.json?.intro !== "diagnostic bot intro")
          throw new Error("intro not saved");
        return "saved";
      }),
    );

    checks.push(
      await run("Submissions: gating blocks out-of-order submit", async () => {
        const r = await api("POST", "/submissions", {
          moduleId: "d3",
          content: "this should be rejected — module d3 is locked",
        });
        if (r.status !== 403)
          throw new Error(`expected 403, got ${r.status}`);
        return "403 as expected";
      }),
    );

    checks.push(
      await run("Submissions: rejects empty content", async () => {
        const r = await api("POST", "/submissions", {
          moduleId: "d1",
          content: "   ",
        });
        if (r.status !== 400)
          throw new Error(`expected 400, got ${r.status}`);
        return "400 as expected";
      }),
    );

    checks.push(
      await run("Submissions: submit module d1", async () => {
        const r = await api("POST", "/submissions", {
          moduleId: "d1",
          content:
            "Diagnostic submission for module d1 — this is a non-graded internal test.",
        });
        if (r.status !== 201) throw new Error(`status ${r.status}`);
        if (r.json?.moduleId !== "d1")
          throw new Error("returned wrong moduleId");
        return `submission id=${r.json?.id}`;
      }),
    );

    checks.push(
      await run("Progress: d1 now appears as completed", async () => {
        const r = await api("GET", "/progress");
        const ids: string[] = r.json?.completedModuleIds ?? [];
        if (!ids.includes("d1"))
          throw new Error(`d1 missing; got [${ids.join(",")}]`);
        return `completed=[${ids.join(",")}]`;
      }),
    );

    checks.push(
      await run("Submissions: list includes d1", async () => {
        const r = await api("GET", "/submissions");
        const list: Array<{ moduleId: string }> = Array.isArray(r.json)
          ? r.json
          : [];
        if (!list.some((s) => s.moduleId === "d1"))
          throw new Error("d1 not in list");
        return `${list.length} submission(s) listed`;
      }),
    );

    checks.push(
      await run("Submissions: get-by-module returns d1", async () => {
        const r = await api("GET", "/submissions/module/d1");
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        if (!r.json?.submission)
          throw new Error("submission not retrievable");
        return "found";
      }),
    );

    checks.push(
      await run("Submissions: gating now lets the next module through (d1 done)", async () => {
        const nextId = modules[1]!.id;
        const r = await api("POST", "/submissions", {
          moduleId: nextId,
          content: `Diagnostic submission for module ${nextId} — verifying sequential unlocking works.`,
        });
        if (r.status !== 201)
          throw new Error(`expected 201, got ${r.status}`);
        return `unlocked ${nextId}`;
      }),
    );

    checks.push(
      await run("Drafts: save and reload draft", async () => {
        const r1 = await api("POST", "/drafts/e1", {
          content: "diagnostic draft body",
        });
        if (r1.status !== 200)
          throw new Error(`POST status ${r1.status}`);
        const r2 = await api("GET", "/drafts/e1");
        if (r2.json?.draft?.content !== "diagnostic draft body")
          throw new Error("draft did not round-trip");
        return "round-trip ok";
      }),
    );

    checks.push(
      await run("Auth: logout clears the session", async () => {
        const r = await api("POST", "/auth/logout");
        if (r.status !== 204) throw new Error(`status ${r.status}`);
        if (r.setCookie) cookie = r.setCookie.split(";")[0]!;
        const after = await api("GET", "/auth/me");
        if (after.json?.student !== null)
          throw new Error("session not cleared");
        return "logged out";
      }),
    );
  } finally {
    // Always clean up the diagnostic student (cascades to submissions/drafts/etc).
    if (createdStudentId != null) {
      const cleanup = await run("Cleanup: delete diagnostic student", async () => {
        await db
          .delete(studentsTable)
          .where(eq(studentsTable.id, createdStudentId as number));
        return `student ${createdStudentId} removed`;
      });
      checks.push(cleanup);
    }
  }

  const ok = checks.every((c) => c.ok);
  res.json({ ok, checks, generatedAt: new Date().toISOString() });
});

export default router;
