import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, PlayCircle } from "lucide-react";

type Check = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
};

type Report = {
  ok: boolean;
  checks: Check[];
  generatedAt: string;
};

type Section = {
  title: string;
  description: string;
  state: "idle" | "running" | "done" | "error";
  report: Report | null;
  error: string | null;
};

const initialSections: Record<"system" | "functional", Section> = {
  system: {
    title: "1. System Check",
    description:
      "Verifies environment variables, database connectivity, AI integration roundtrip, and that the curriculum is fully loaded.",
    state: "idle",
    report: null,
    error: null,
  },
  functional: {
    title: "2. Functional Check",
    description:
      "Creates a temporary diagnostic user, walks through login → progress → submit → sequential unlock → drafts → logout, then deletes the test user. Verifies that core user flows actually work end-to-end.",
    state: "idle",
    report: null,
    error: null,
  },
};

export default function Diagnostic() {
  const [sections, setSections] = useState(initialSections);

  async function runAll() {
    setSections((s) => ({
      system: { ...s.system, state: "running", report: null, error: null },
      functional: {
        ...s.functional,
        state: "running",
        report: null,
        error: null,
      },
    }));

    await runSection("system", "GET", "/api/diagnostic/system");
    await runSection("functional", "POST", "/api/diagnostic/functional");
  }

  async function runSection(
    key: "system" | "functional",
    method: "GET" | "POST",
    path: string,
  ) {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const report = (await r.json()) as Report;
      setSections((s) => ({
        ...s,
        [key]: {
          ...s[key],
          state: report.ok ? "done" : "error",
          report,
          error: null,
        },
      }));
    } catch (e) {
      setSections((s) => ({
        ...s,
        [key]: {
          ...s[key],
          state: "error",
          report: null,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  const anyRunning =
    sections.system.state === "running" ||
    sections.functional.state === "running";

  const overall: "idle" | "running" | "pass" | "fail" =
    anyRunning
      ? "running"
      : sections.system.state === "idle" &&
          sections.functional.state === "idle"
        ? "idle"
        : sections.system.report?.ok && sections.functional.report?.ok
          ? "pass"
          : "fail";

  return (
    <PageShell
      title="Diagnostic"
      intro="Run a self-test of the application — verifies that all backend services, the database, the AI integration, and the core user flows are functioning. This does not evaluate the quality of any answers, grades, or content; it only verifies that the formal mechanics of the app work."
    >
      <Card>
        <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-stone-700">
              Press the button to run a full system + functional self-check.
              Results appear below. Total runtime: roughly 5–15 seconds.
            </p>
            <p className="mt-1 text-xs text-stone-500">
              The functional test creates a temporary "Diagnostic Bot" user and
              deletes it when finished. No real student data is touched.
            </p>
          </div>
          <Button
            size="lg"
            onClick={runAll}
            disabled={anyRunning}
            data-testid="button-run-diagnostic"
          >
            {anyRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 h-4 w-4" />
                Run Diagnostic
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {overall !== "idle" && (
        <Card className={overall === "fail" ? "border-red-300" : overall === "pass" ? "border-emerald-300" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {overall === "running" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
                  <span className="font-medium">Running diagnostic…</span>
                </>
              )}
              {overall === "pass" && (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium text-emerald-800">
                    All checks passed.
                  </span>
                </>
              )}
              {overall === "fail" && (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-800">
                    One or more checks failed — see details below.
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(["system", "functional"] as const).map((key) => {
        const s = sections[key];
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="font-serif text-lg">{s.title}</CardTitle>
              <p className="text-sm text-stone-600">{s.description}</p>
            </CardHeader>
            <CardContent>
              {s.state === "idle" && (
                <p className="text-sm text-stone-500">Not yet run.</p>
              )}
              {s.state === "running" && (
                <p className="flex items-center gap-2 text-sm text-stone-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Running…
                </p>
              )}
              {s.error && (
                <p className="text-sm text-red-700" data-testid={`text-${key}-error`}>
                  Failed to run: {s.error}
                </p>
              )}
              {s.report && (
                <ul className="divide-y divide-stone-200" data-testid={`list-${key}-checks`}>
                  {s.report.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 py-2">
                      {c.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-stone-900">
                            {c.name}
                          </span>
                          <span className="text-xs text-stone-500">
                            {c.ms}ms
                          </span>
                        </div>
                        {c.detail && (
                          <div className="text-xs text-stone-600">
                            {c.detail}
                          </div>
                        )}
                        {c.error && (
                          <div className="text-xs text-red-700">
                            error: {c.error}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </PageShell>
  );
}
