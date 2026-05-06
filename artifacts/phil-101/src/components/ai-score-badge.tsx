import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

interface AIScoreBadgeProps {
  score: number | null | undefined;
  cls?: string | null;
  checkedAt?: string | null;
  status?: "pending" | "completed" | "failed" | string | null;
  /** "compact" = inline pill; "full" = larger card with explanation */
  variant?: "compact" | "full";
}

function bucket(score: number) {
  if (score >= 0.7)
    return {
      label: "Likely AI-generated",
      tone: "high" as const,
      explain:
        "GPTZero rates this writing as very likely produced by an AI. Your instructor will review it carefully.",
    };
  if (score >= 0.3)
    return {
      label: "Mixed / uncertain",
      tone: "medium" as const,
      explain:
        "GPTZero is uncertain. The text may include AI-assisted passages. Your instructor may follow up.",
    };
  return {
    label: "Likely human-written",
    tone: "low" as const,
    explain:
      "GPTZero rates this writing as likely written by a human. Nice work.",
  };
}

const TONE_CLASSES = {
  low: {
    pill: "border-emerald-300 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  medium: {
    pill: "border-amber-300 bg-amber-50 text-amber-900",
    icon: "text-amber-700",
    bar: "bg-amber-500",
  },
  high: {
    pill: "border-red-300 bg-red-50 text-red-900",
    icon: "text-red-700",
    bar: "bg-red-500",
  },
};

export function AIScoreBadge({
  score,
  cls,
  checkedAt,
  status,
  variant = "full",
}: AIScoreBadgeProps) {
  if (score == null) {
    const failed = status === "failed";
    const title = failed ? "AI check unavailable" : "AI check in progress";
    const detail = failed
      ? "We couldn't reach the AI-detection service for this submission. Your work was saved either way."
      : "GPTZero is scoring your submission. The result will appear here automatically.";
    const testid = failed ? "ai-score-failed" : "ai-score-pending";

    if (variant === "compact") {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-600"
          data-testid={testid}
          title={title}
        >
          <ShieldQuestion className="h-3 w-3" />
          {failed ? "AI check unavailable" : "AI check…"}
        </span>
      );
    }
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700"
        data-testid={testid}
        aria-live="polite"
      >
        <ShieldQuestion className="mt-0.5 h-4 w-4 text-stone-500" />
        <div>
          <div className="font-semibold text-stone-800">{title}</div>
          <p className="text-xs text-stone-600">{detail}</p>
        </div>
      </div>
    );
  }

  const b = bucket(score);
  const t = TONE_CLASSES[b.tone];
  const pct = Math.round(score * 100);

  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${t.pill}`}
        title={`${b.label} — ${pct}% AI probability${cls ? ` (class: ${cls})` : ""}`}
        data-testid={`ai-score-${b.tone}`}
      >
        {b.tone === "low" ? (
          <ShieldCheck className={`h-3 w-3 ${t.icon}`} />
        ) : (
          <ShieldAlert className={`h-3 w-3 ${t.icon}`} />
        )}
        AI: {pct}%
      </span>
    );
  }

  return (
    <div
      className={`rounded-md border p-3 ${t.pill}`}
      data-testid={`ai-score-${b.tone}`}
    >
      <div className="flex items-start gap-2">
        {b.tone === "low" ? (
          <ShieldCheck className={`mt-0.5 h-4 w-4 ${t.icon}`} />
        ) : (
          <ShieldAlert className={`mt-0.5 h-4 w-4 ${t.icon}`} />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold">
              AI-detection: {b.label}
            </div>
            <div className="text-xs">
              {pct}% AI probability
              {cls ? ` · class: ${cls}` : ""}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
            <div
              className={`h-full ${t.bar} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs">{b.explain}</p>
          {checkedAt && (
            <p className="mt-1 text-[10px] opacity-70">
              Checked by GPTZero · {new Date(checkedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
