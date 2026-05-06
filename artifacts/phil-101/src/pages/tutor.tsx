import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getTutorConversation,
  getGetTutorConversationQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { moduleById, modules } from "@/data/curriculum";
import { fetchSse } from "@/lib/sse";
import { Bot, User, Sparkles } from "lucide-react";

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export default function Tutor() {
  const params = useParams<{ moduleId: string }>();
  const moduleId = params.moduleId || "d1";
  const m = moduleById(moduleId);

  const conv = useQuery({
    queryKey: getGetTutorConversationQueryKey(moduleId),
    queryFn: () => getTutorConversation(moduleId),
    enabled: !!m,
  });

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const baseMessages: ChatMessage[] = (conv.data?.messages ?? []).map((mm) => ({
    id: mm.id,
    role: mm.role as "user" | "assistant",
    content: mm.content,
  }));
  const allMessages = [...baseMessages, ...streaming];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [allMessages.length, streaming]);

  if (!m) {
    return (
      <PageShell title="Module not found">
        <Link href="/modules" className="underline">
          Back to module list
        </Link>
      </PageShell>
    );
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
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
        body: JSON.stringify({ content: text }),
        credentials: "include",
      },
      (data: any) => {
        if (typeof data?.content === "string") {
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
        setSending(false);
      },
      () => {
        setStreaming((s) =>
          s.map((mm) =>
            mm.id === assistantMsg.id ? { ...mm, pending: false } : mm,
          ),
        );
        setSending(false);
        // Refresh history so the persisted version is shown
        conv.refetch().then(() => setStreaming([]));
      },
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            AI Tutor — Module {m.number}
          </p>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">
            {m.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/modules/${m.id}`}>
            <Button variant="outline" size="sm" data-testid="button-back-module">
              View module
            </Button>
          </Link>
          <ModuleSwitcher current={m.id} />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
        <Sparkles className="h-3.5 w-3.5" />
        Powered by Anthropic Claude (Sonnet 4.5). The tutor will help you
        think but will not write your assignment for you.
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="flex flex-col">
          <CardHeader className="border-b border-stone-200">
            <CardTitle className="font-serif text-base">
              Conversation
            </CardTitle>
          </CardHeader>

          <div
            ref={scrollRef}
            className="h-[55vh] overflow-y-auto px-4 py-4"
            data-testid="container-messages"
          >
            {allMessages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-stone-500">
                <Bot className="mb-2 h-8 w-8 text-stone-400" />
                Say hello to begin. Try: "Where should I start with this
                module?"
              </div>
            )}
            <ul className="space-y-4">
              {allMessages.map((mm) => (
                <li
                  key={mm.id}
                  className="flex gap-3"
                  data-testid={`msg-${mm.role}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {mm.role === "assistant" ? (
                      <Bot className="h-5 w-5 text-stone-700" />
                    ) : (
                      <User className="h-5 w-5 text-stone-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {mm.role === "assistant" ? "Tutor" : "You"}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-900">
                      {mm.content}
                      {mm.pending && (
                        <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-stone-400 align-middle" />
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
                placeholder="Ask a question or share your draft thinking…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending}
                data-testid="input-tutor-message"
              />
              <Button
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                data-testid="button-send-message"
              >
                {sending ? "…" : "Send"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Press ⌘/Ctrl + Enter to send.
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base">
                Module context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="capitalize">
                  {m.type}
                </Badge>
                <Badge variant="secondary">{m.points} pts</Badge>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Objectives
                </h3>
                <ol className="list-decimal space-y-1 pl-5 text-stone-800">
                  {m.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Show assignment prompt
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-stone-800">
                  {m.assignment}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ModuleSwitcher({ current }: { current: string }) {
  return (
    <select
      className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
      value={current}
      onChange={(e) => {
        window.location.href = `${import.meta.env.BASE_URL}tutor/${e.target.value}`;
      }}
      data-testid="select-module"
    >
      {modules.map((m) => (
        <option key={m.id} value={m.id}>
          M{m.number} — {m.title}
        </option>
      ))}
    </select>
  );
}
