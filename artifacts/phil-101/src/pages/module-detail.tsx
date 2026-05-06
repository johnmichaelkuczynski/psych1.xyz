import { Link, useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentStudent,
  getSubmissionForModule,
  getGetSubmissionForModuleQueryKey,
  getGetProgressQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { moduleById, modules } from "@/data/curriculum";
import { TutorPanel } from "@/components/tutor-panel";
import { InlineAIAction } from "@/components/inline-ai-action";
import { AIScoreBadge } from "@/components/ai-score-badge";
import { DraftWorkshop } from "@/components/draft-workshop";
import { IntegrityCanvas } from "@/components/integrity-canvas";
import { IntegrityDisclosureGate } from "@/components/integrity-disclosure";
import {
  ArrowRight,
  Bot,
  BookOpen,
  GraduationCap,
  Headphones,
  Sparkles,
  Wand2,
} from "lucide-react";

export default function ModuleDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const m = moduleById(params.id);

  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ["me-module"],
    queryFn: () => getCurrentStudent(),
  });
  const accommodated = !!me.data?.student?.accommodated;

  const submission = useQuery({
    queryKey: getGetSubmissionForModuleQueryKey(params.id),
    queryFn: () => getSubmissionForModule(params.id),
    enabled: !!m,
    // Poll while GPTZero is still scoring, then stop.
    refetchInterval: (q) => {
      const s = q.state.data?.submission;
      return s && s.aiStatus === "pending" ? 2000 : false;
    },
  });

  async function handleSubmitted() {
    await qc.invalidateQueries({
      queryKey: getGetSubmissionForModuleQueryKey(params.id),
    });
    await qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
  }

  if (!m) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-serif text-2xl">Module not found</h1>
        <Link href="/modules" className="underline">
          Back to module list
        </Link>
      </div>
    );
  }

  const idx = modules.findIndex((mm) => mm.id === m.id);
  const next = modules[idx + 1];
  const existing = submission.data?.submission ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <IntegrityDisclosureGate />
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">
          {m.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {m.type}
          </Badge>
          <Badge variant="secondary">{m.points} pts</Badge>
          <span className="text-sm text-stone-500">
            Module {m.number} of {modules.length}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Module content — 2/3 on desktop */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Learning objectives
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-1 pl-5 text-stone-800">
                {m.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {m.reading.trim() && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-serif text-lg">Reading</CardTitle>
                  <span className="hidden text-xs text-stone-500 sm:inline">
                    AI helpers below — try them before you draft.
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-stone-800">
                  {m.reading}
                </pre>

                <div className="space-y-2 border-t border-stone-200 pt-4">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI helpers for this reading
                  </div>
                  <InlineAIAction
                    moduleId={m.id}
                    action="study-guide"
                    label="Generate Study Guide"
                    icon={<BookOpen className="h-3.5 w-3.5" />}
                    description="Key concepts, core arguments, common pitfalls, self-check questions."
                  />
                  <InlineAIAction
                    moduleId={m.id}
                    action="tutorial"
                    label="Generate Tutorial"
                    icon={<GraduationCap className="h-3.5 w-3.5" />}
                    description="Step-by-step walkthrough of the material."
                  />
                  <InlineAIAction
                    moduleId={m.id}
                    action="podcast"
                    label="Generate Podcast"
                    icon={<Headphones className="h-3.5 w-3.5" />}
                    description="A 2–3 minute audio explainer you can listen to."
                  />
                  <InlineAIAction
                    moduleId={m.id}
                    action="rewrite"
                    label="Rewrite for Clarity"
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                    description="Same ideas, simpler sentences."
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-stone-800">
                {m.assignment}
              </pre>
            </CardContent>
          </Card>

          {existing && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">
                  Your latest submission
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Submitted on{" "}
                  {new Date(existing.createdAt).toLocaleString()}. You may
                  revise and resubmit below — your most recent submission
                  counts.
                </div>
                <AIScoreBadge
                  score={existing.aiScore ?? null}
                  cls={existing.aiClass ?? null}
                  checkedAt={existing.aiCheckedAt ?? null}
                  status={existing.aiStatus}
                  variant="full"
                />
                <details className="rounded-md border border-stone-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-stone-800">
                    Show previous submission
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-stone-700">
                    {existing.content}
                  </pre>
                </details>
              </CardContent>
            </Card>
          )}

          <DraftWorkshop moduleId={m.id} />

          <IntegrityCanvas
            moduleId={m.id}
            accommodated={accommodated}
            hasExistingSubmission={!!existing}
            onSubmitted={handleSubmitted}
          />

          <div className="flex flex-wrap gap-3 pt-2">
            {next && existing && (
              <Button
                variant="outline"
                onClick={() => navigate(`/modules/${next.id}`)}
                data-testid="button-next-module"
              >
                Continue to Module {next.number}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            <Link href="/modules">
              <Button variant="ghost">Back to modules</Button>
            </Link>
          </div>
        </div>

        {/* Tutor side panel — 1/3 on desktop, sticky */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <Card className="overflow-hidden p-0">
              <TutorPanel
                moduleId={m.id}
                scrollerClassName="h-[calc(100vh-22rem)] min-h-[320px]"
              />
            </Card>
            <p className="mt-2 text-[11px] text-stone-500">
              The tutor stays with you on every module. Conversations are
              saved per module and reviewed by the instructor.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile / tablet: slide-up tutor drawer */}
      <div className="lg:hidden">
        <Drawer>
          <DrawerTrigger asChild>
            <button
              className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-3 text-sm font-medium text-stone-50 shadow-lg hover:bg-stone-800"
              data-testid="button-open-tutor-drawer"
            >
              <Bot className="h-4 w-4" />
              AI Tutor
            </button>
          </DrawerTrigger>
          <DrawerContent className="h-[85vh]">
            <DrawerHeader className="border-b border-stone-200 py-3">
              <DrawerTitle className="flex items-center gap-2 font-serif text-base">
                <Bot className="h-4 w-4" />
                AI Tutor — Module {m.number}
              </DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TutorPanel
                moduleId={m.id}
                compact
                scrollerClassName="h-[calc(85vh-12rem)] min-h-[200px]"
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
