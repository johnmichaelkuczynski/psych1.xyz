import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  listSubmissions,
  getListSubmissionsQueryKey,
  useGenerateCritiqueAnswer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/page-shell";
import { modules } from "@/data/curriculum";
import { toast } from "sonner";
import { CheckCircle2, FileText, Sparkles } from "lucide-react";
import { AIScoreBadge } from "@/components/ai-score-badge";

export default function Assessments() {
  const subs = useQuery({
    queryKey: getListSubmissionsQueryKey(),
    queryFn: () => listSubmissions(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((s) => s.aiStatus === "pending")
        ? 2500
        : false,
  });

  const submittedIds = new Set(
    (subs.data ?? []).map((s) => s.moduleId),
  );
  const earned = modules
    .filter((m) => submittedIds.has(m.id))
    .reduce((sum, m) => sum + m.points, 0);
  const total = modules.reduce((sum, m) => sum + m.points, 0);

  return (
    <PageShell
      title="Assessments"
      intro="Track your submissions and use the Practice Critique tool to sharpen your evaluation skills."
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Progress summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className="text-3xl font-semibold text-stone-900"
              data-testid="text-earned-points"
            >
              {earned}
            </span>
            <span className="text-stone-600">
              / {total} points submitted (awaiting instructor feedback)
            </span>
          </div>
          <div className="mt-2 text-sm text-stone-600">
            {submittedIds.size} of {modules.length} modules submitted.
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full bg-stone-900 transition-all"
              style={{
                width: `${total ? (earned / total) * 100 : 0}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">All assessments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-300 text-left">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Module</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2 text-right">Points</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">AI check</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const sub = (subs.data ?? []).find((s) => s.moduleId === m.id);
                return (
                  <tr key={m.id} className="border-b border-stone-200">
                    <td className="px-2 py-2 text-stone-500">{m.number}</td>
                    <td className="px-2 py-2 text-stone-900">{m.title}</td>
                    <td className="px-2 py-2 capitalize text-stone-700">
                      {m.type}
                    </td>
                    <td className="px-2 py-2 text-right text-stone-900">
                      {m.points}
                    </td>
                    <td className="px-2 py-2">
                      {sub ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Submitted{" "}
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-stone-500">Not yet submitted</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {sub ? (
                        <AIScoreBadge
                          score={sub.aiScore ?? null}
                          cls={sub.aiClass ?? null}
                          checkedAt={sub.aiCheckedAt ?? null}
                          status={sub.aiStatus}
                          variant="compact"
                        />
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/modules/${m.id}`}
                        className="text-stone-900 underline hover:text-stone-700"
                        data-testid={`link-assess-${m.id}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <PracticeCritique />
    </PageShell>
  );
}

function PracticeCritique() {
  const [moduleId, setModuleId] = useState<string>(modules[0].id);
  const [generated, setGenerated] = useState<string>("");
  const [critique, setCritique] = useState<string>("");

  // Restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`critique:${moduleId}`);
    setCritique(saved ?? "");
    const savedGen = localStorage.getItem(`critique-gen:${moduleId}`);
    setGenerated(savedGen ?? "");
  }, [moduleId]);

  useEffect(() => {
    if (critique) localStorage.setItem(`critique:${moduleId}`, critique);
  }, [critique, moduleId]);

  const generate = useGenerateCritiqueAnswer({
    mutation: {
      onSuccess: (data) => {
        setGenerated(data.answer);
        localStorage.setItem(`critique-gen:${moduleId}`, data.answer);
        toast.success("Sample answer generated — now critique it.");
      },
      onError: (e) => toast.error(e.message),
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">
          Practice Critique (self-check)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-stone-700">
          Generate a deliberately mediocre sample answer for any module's
          assignment, then write your own critique of it. This is a
          formative, ungraded exercise — your critique stays in your browser.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            data-testid="select-critique-module"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                M{m.number} — {m.title}
              </option>
            ))}
          </select>
          <Button
            onClick={() => generate.mutate({ moduleId })}
            disabled={generate.isPending}
            data-testid="button-generate-critique"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {generate.isPending ? "Generating…" : "Generate sample answer"}
          </Button>
        </div>

        {generated && (
          <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <FileText className="h-3.5 w-3.5" />
              Sample answer (mediocre on purpose)
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
              {generated}
            </p>
          </div>
        )}

        {generated && (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-800">
              Your critique
            </label>
            <Textarea
              rows={8}
              placeholder="What's strong? What's weak? What's missing? What would a stronger answer add?"
              value={critique}
              onChange={(e) => setCritique(e.target.value)}
              data-testid="input-critique"
            />
            <p className="text-xs text-stone-500">
              Saved automatically in your browser.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
