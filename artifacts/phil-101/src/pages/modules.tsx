import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getProgress,
  getGetProgressQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { modules } from "@/data/curriculum";
import { useAdminOverride } from "@/lib/admin";
import { CheckCircle2, Lock, PlayCircle, ShieldCheck } from "lucide-react";

export default function Modules() {
  const admin = useAdminOverride();
  const progress = useQuery({
    queryKey: getGetProgressQueryKey(),
    queryFn: () => getProgress(),
  });

  const completed = new Set(progress.data?.completedModuleIds ?? []);

  return (
    <PageShell
      title="Modules"
      intro="The 13 modules of Psychology 101, in order. Each unlocks once you submit the previous one."
    >
      {admin && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldCheck className="h-4 w-4" />
          Admin override active — all modules unlocked (
          <code>?admin=true</code>).
        </div>
      )}

      <div className="space-y-3">
        {modules.map((m, i) => {
          const prev = modules[i - 1];
          const unlocked =
            admin || i === 0 || (prev && completed.has(prev.id));
          const done = completed.has(m.id);

          return (
            <Card
              key={m.id}
              className={!unlocked ? "opacity-60" : ""}
              data-testid={`card-module-${m.id}`}
            >
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : unlocked ? (
                      <PlayCircle className="h-5 w-5 text-stone-700" />
                    ) : (
                      <Lock className="h-5 w-5 text-stone-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Module {m.number}
                      </span>
                      <Badge variant="outline" className="capitalize">
                        {m.type}
                      </Badge>
                      <Badge variant="secondary">{m.points} pts</Badge>
                      {done && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          Submitted
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-serif text-lg font-semibold text-stone-900">
                      {m.title}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-stone-600">
                      {m.objectives[0]}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  {unlocked ? (
                    <Link
                      href={`/modules/${m.id}`}
                      className="inline-flex items-center justify-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-stone-800"
                      data-testid={`link-open-${m.id}`}
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-3 py-1.5 text-xs text-stone-500">
                      <Lock className="h-3 w-3" />
                      Submit Module {m.number - 1} to unlock
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
