import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, Loader2, Lock, MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { integrityApi, type DraftRow } from "@/lib/integrity-api";

/**
 * Box 1 — single-shot draft + AI feedback. Once feedback is returned the
 * draft becomes read-only and the feedback stays on the page forever.
 */
export function DraftWorkshop({ moduleId }: { moduleId: string }) {
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    integrityApi
      .getDraft(moduleId)
      .then((r) => {
        setDraft(r.draft);
        setContent(r.draft?.content ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moduleId]);

  async function handleGetFeedback() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const r = await integrityApi.postDraft(moduleId, content);
      setDraft(r.draft);
      toast.success("Feedback generated. Draft is now locked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const locked = draft?.locked ?? false;

  return (
    <Card data-testid="draft-workshop">
      <CardHeader>
        <CardTitle className="font-serif text-lg">
          <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <Lightbulb className="h-3.5 w-3.5" />
            Box 1
          </span>
          Draft Workshop — get AI feedback before writing your submission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You get <strong>one</strong> round of feedback. After you click{" "}
          <em>Get Feedback</em>, this box becomes read-only. The AI will tell
          you <em>what</em> to improve, never <em>how</em> to phrase it.
          Pasting is allowed in this box.
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Textarea
              rows={10}
              placeholder="Type or paste your draft here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={locked || submitting}
              data-testid="input-draft"
            />

            {!locked && (
              <Button
                onClick={handleGetFeedback}
                disabled={submitting || !content.trim()}
                data-testid="button-get-feedback"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Reading your draft…
                  </>
                ) : (
                  <>
                    <MessageSquareQuote className="mr-1 h-4 w-4" />
                    Get Feedback
                  </>
                )}
              </Button>
            )}

            {locked && draft?.feedback && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Lock className="h-3.5 w-3.5" />
                  Feedback (draft locked)
                </div>
                <FeedbackRender markdown={draft.feedback} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackRender({ markdown }: { markdown: string }) {
  // Lightweight: split on H2 headings.
  const blocks = markdown.split(/^##\s+/m).filter((b) => b.trim());
  return (
    <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      {blocks.map((block, i) => {
        const [heading, ...rest] = block.split("\n");
        return (
          <div key={i}>
            <h4 className="mb-1 font-serif text-sm font-semibold text-stone-900">
              {heading}
            </h4>
            <p className="whitespace-pre-wrap text-sm text-stone-700">
              {rest.join("\n").trim()}
            </p>
          </div>
        );
      })}
    </div>
  );
}
