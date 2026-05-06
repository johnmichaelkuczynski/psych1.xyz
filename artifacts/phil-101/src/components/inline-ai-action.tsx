import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetchSse } from "@/lib/sse";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

type ActionId =
  | "study-guide"
  | "tutorial"
  | "podcast"
  | "rewrite"
  | "read-draft";

interface InlineAIActionProps {
  moduleId: string;
  action: ActionId;
  label: string;
  icon: React.ReactNode;
  description?: string;
  /** Only used for read-draft */
  getDraft?: () => string;
  /** When true, render compact (button only, no description). */
  compact?: boolean;
}

function renderMarkdownish(text: string): React.ReactNode {
  // Lightweight inline rendering: paragraphs, ## headings, - bullets, **bold**, `code`
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = (key: string) => {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={`ul-${key}`} className="mb-3 list-disc space-y-1 pl-5">
        {listBuf.map((li, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(li) }} />
        ))}
      </ul>,
    );
    listBuf = [];
  };
  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-stone-100 px-1 py-0.5 text-[12px]">$1</code>');
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flushList(`h-${i}`);
      out.push(
        <h3
          key={`h-${i}`}
          className="mt-4 mb-1 font-serif text-sm font-semibold text-stone-900"
          dangerouslySetInnerHTML={{ __html: inline(line.replace(/^##\s+/, "")) }}
        />,
      );
    } else if (/^#\s+/.test(line)) {
      flushList(`h-${i}`);
      out.push(
        <h2
          key={`h-${i}`}
          className="mt-4 mb-1 font-serif text-base font-semibold text-stone-900"
          dangerouslySetInnerHTML={{ __html: inline(line.replace(/^#\s+/, "")) }}
        />,
      );
    } else if (/^[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flushList(`p-${i}`);
    } else {
      flushList(`p-${i}`);
      out.push(
        <p
          key={`p-${i}`}
          className="mb-2 text-[14px] leading-relaxed text-stone-800"
          dangerouslySetInnerHTML={{ __html: inline(line) }}
        />,
      );
    }
  });
  flushList("end");
  return out;
}

export function InlineAIAction({
  moduleId,
  action,
  label,
  icon,
  description,
  getDraft,
  compact = false,
}: InlineAIActionProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const isPodcast = action === "podcast";
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function run() {
    if (running) return;
    if (action === "read-draft") {
      const d = (getDraft?.() ?? "").trim();
      if (!d) {
        setErr("Type a draft in the response box first, then try again.");
        setOpen(true);
        setText("");
        return;
      }
    }
    setOpen(true);
    setText("");
    setErr(null);
    setRunning(true);

    let acc = "";
    const body =
      action === "read-draft"
        ? JSON.stringify({ draft: getDraft?.() ?? "" })
        : JSON.stringify({});

    await fetchSse(
      `/api/ai/${moduleId}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        credentials: "include",
      },
      (data: { content?: string }) => {
        if (typeof data.content === "string") {
          acc += data.content;
          setText(acc);
        }
      },
      (e: string) => setErr(e),
      () => setRunning(false),
    );
  }

  function speak() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  function stopSpeaking() {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  const ttsAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <div className="rounded-md border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={open ? "secondary" : "outline"}
            onClick={open ? () => setOpen(false) : run}
            disabled={running}
            data-testid={`button-ai-${action}`}
          >
            {running ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="mr-1.5 inline-flex">{icon}</span>
            )}
            {running ? `Generating ${label.toLowerCase()}…` : label}
          </Button>
          {!compact && description && !open && (
            <span className="text-xs text-stone-500">{description}</span>
          )}
        </div>
        {open && (
          <div className="flex items-center gap-1">
            {!running && text && (
              <Button
                size="sm"
                variant="ghost"
                onClick={run}
                data-testid={`button-ai-${action}-regen`}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label="Collapse"
              data-testid={`button-ai-${action}-collapse`}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        )}
        {!open && text && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(true)}
            aria-label="Expand previous result"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {open && (
        <div
          className="border-t border-stone-200 bg-stone-50 px-4 py-3"
          aria-live="polite"
          aria-atomic="false"
          aria-busy={running}
        >
          {isPodcast && text && ttsAvailable && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2">
              {speaking ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopSpeaking}
                  data-testid="button-podcast-stop"
                >
                  <Pause className="mr-1 h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={speak}
                  disabled={running}
                  data-testid="button-podcast-play"
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Listen
                </Button>
              )}
              <span className="text-xs text-stone-600">
                Plays in your browser using its built-in voice.
              </span>
            </div>
          )}

          {err && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </div>
          )}

          <span role="status" className="sr-only">
            {running
              ? `Generating ${label.toLowerCase()}…`
              : text
                ? `${label} ready.`
                : ""}
          </span>

          {text ? (
            <div className="prose prose-stone max-w-none">
              {renderMarkdownish(text)}
              {running && (
                <span className="inline-block h-3 w-1.5 animate-pulse bg-stone-400 align-middle" />
              )}
            </div>
          ) : running ? (
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working…
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
