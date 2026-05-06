import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getTutorConversation,
  getGetTutorConversationQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchSse } from "@/lib/sse";
import { Bot, User, Sparkles } from "lucide-react";

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface TutorPanelProps {
  moduleId: string;
  /** Optional draft text the student is currently working on; surfaced as a quick action. */
  getDraft?: () => string;
  onSendDraftForFeedback?: () => void;
  /** When true, renders a more compact header (used inside the mobile drawer). */
  compact?: boolean;
  /** Height utility class for the messages scroller. */
  scrollerClassName?: string;
}

export function TutorPanel({
  moduleId,
  compact = false,
  scrollerClassName = "h-[calc(100vh-22rem)] min-h-[280px]",
}: TutorPanelProps) {
  const conv = useQuery({
    queryKey: getGetTutorConversationQueryKey(moduleId),
    queryFn: () => getTutorConversation(moduleId),
  });

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset transient state when switching modules
  useEffect(() => {
    setStreaming([]);
    setDraft("");
  }, [moduleId]);

  const baseMessages: ChatMessage[] = (conv.data?.messages ?? []).map(
    (mm) => ({
      id: mm.id,
      role: mm.role as "user" | "assistant",
      content: mm.content,
    }),
  );
  const allMessages = [...baseMessages, ...streaming];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [allMessages.length, streaming]);

  async function handleSend(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;

    setSending(true);
    setDraft("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      pending: true,
    };
    setStreaming((s) => [...s, userMsg, assistantMsg]);

    let acc = "";
    await fetchSse(
      `/api/tutor/${moduleId}/message`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      },
      (data: { content?: string }) => {
        if (typeof data.content === "string") {
          acc += data.content;
          setStreaming((s) =>
            s.map((mm) =>
              mm.id === assistantMsg.id ? { ...mm, content: acc } : mm,
            ),
          );
        }
      },
      (err: string) => {
        setStreaming((s) =>
          s.map((mm) =>
            mm.id === assistantMsg.id
              ? {
                  ...mm,
                  content: acc + `\n\n[Tutor error: ${err}]`,
                  pending: false,
                }
              : mm,
          ),
        );
      },
      () => {
        setStreaming((s) =>
          s.map((mm) =>
            mm.id === assistantMsg.id ? { ...mm, pending: false } : mm,
          ),
        );
        setSending(false);
        conv.refetch().then(() => setStreaming([]));
      },
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="tutor-panel">
      {!compact && (
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-stone-700" />
            <h2 className="font-serif text-sm font-semibold text-stone-900">
              AI Tutor
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
            <Sparkles className="h-3 w-3" />
            Claude Sonnet 4.5
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className={`overflow-y-auto px-4 py-3 ${scrollerClassName}`}
        aria-live="polite"
        data-testid="tutor-messages"
      >
        {allMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-stone-500">
            <Bot className="h-6 w-6 text-stone-400" />
            <p className="px-2">
              Hi — I'm your AI tutor for this module. Ask me a question, or
              try one of the prompts below.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {[
                "Where should I start?",
                "Explain the key idea",
                "Give me a counterargument",
              ].map((q) => (
                <button
                  key={q}
                  className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] text-stone-700 hover:bg-stone-100"
                  onClick={() => handleSend(q)}
                  data-testid={`button-quick-${q.slice(0, 12)}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <ul className="space-y-3">
          {allMessages.map((mm) => (
            <li
              key={mm.id}
              className="flex gap-2"
              data-testid={`tutor-msg-${mm.role}`}
            >
              <div className="mt-0.5 shrink-0">
                {mm.role === "assistant" ? (
                  <Bot className="h-4 w-4 text-stone-700" />
                ) : (
                  <User className="h-4 w-4 text-stone-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  {mm.role === "assistant" ? "Tutor" : "You"}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-stone-900">
                  {mm.content}
                  {mm.pending && (
                    <span className="ml-1 inline-block h-2.5 w-1 animate-pulse bg-stone-400 align-middle" />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex gap-2">
          <Textarea
            rows={2}
            placeholder="Ask the tutor anything about this module…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            className="text-sm"
            data-testid="input-tutor"
          />
          <Button
            onClick={() => handleSend()}
            disabled={sending || !draft.trim()}
            size="sm"
            data-testid="button-tutor-send"
          >
            {sending ? "…" : "Send"}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-stone-500">
          ⌘/Ctrl + Enter to send. The tutor will not write your assignment.
        </p>
      </div>
    </div>
  );
}
