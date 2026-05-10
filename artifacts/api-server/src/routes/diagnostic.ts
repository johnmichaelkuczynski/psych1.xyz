import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, studentsTable, submissionsTable } from "@workspace/db";
import { modules } from "../lib/curriculum";

const router: IRouter = Router();

type Check = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
};

async function run(name: string, fn: () => Promise<string | void>): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return {
      name,
      ok: true,
      ms: Date.now() - start,
      detail: typeof detail === "string" ? detail : undefined,
    };
  } catch (e) {
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
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
    await run("Environment: GPTZERO_API_KEY (optional)", async () => {
      if (!process.env.GPTZERO_API_KEY)
        throw new Error("not set — AI-writing detector disabled");
      return "set";
    }),
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

  const ok = checks.every((c) => c.ok || c.name.includes("optional"));
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
