import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, EyeOff, Loader2, ShieldCheck, Type, X } from "lucide-react";
import { toast } from "sonner";
import { integrityApi } from "@/lib/integrity-api";

/**
 * Per-event log shape. We log BOTH the legacy {k,d} keys (so older
 * activity-report code keeps working without changes) AND the new rich
 * keys (type/len/caretBefore/caretAfter/text/charCount) that the writing-
 * process forensics analyzer reads. Server-side analyzer normalizes both.
 */
interface KeystrokeEvent {
  t: number;
  // Legacy
  k: "i" | "d" | "m" | "p_blocked" | "p_allowed" | "h_off" | "h_on";
  d?: string;
  p?: number;
  // Rich (new)
  type?: "insert" | "delete" | "caretJump" | "focus" | "blur";
  pos?: number;
  len?: number;
  charCount?: number;
  caretBefore?: number | null;
  caretAfter?: number | null;
  text?: string;
}

interface ScoreSample {
  t: number;
  score: number;
  cls: string;
}

interface SentenceResult {
  text: string;
  generatedProb: number;
}

type Bucket = "green" | "yellow" | "red" | "neutral";

function bucketOf(score: number | null): Bucket {
  if (score == null) return "neutral";
  if (score >= 0.7) return "red";
  if (score >= 0.3) return "yellow";
  return "green";
}

const BUCKET_COLORS: Record<Bucket, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  neutral: "bg-stone-300",
};

const BUCKET_LABEL: Record<Bucket, string> = {
  green: "Green — looks human",
  yellow: "Yellow — questionable",
  red: "Red — AI detected",
  neutral: "Not enough text yet",
};

interface IntegrityCanvasProps {
  moduleId: string;
  accommodated: boolean;
  hasExistingSubmission: boolean;
  /** Called when the student submits successfully. */
  onSubmitted: () => void;
}

export function IntegrityCanvas({
  moduleId,
  accommodated,
  hasExistingSubmission,
  onSubmitted,
}: IntegrityCanvasProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs (no re-render on each keystroke)
  const startRef = useRef<number>(Date.now());
  const keystrokesRef = useRef<KeystrokeEvent[]>([]);
  const scoreHistoryRef = useRef<ScoreSample[]>([]);
  const internalClipRef = useRef<string>("");
  const lastScoredAtRef = useRef<number>(0);
  const lastScoredLenRef = useRef<number>(0);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRedRef = useRef<boolean>(false);
  const cumulativeRedMsRef = useRef<number>(0);
  const lastBucketTickRef = useRef<number>(Date.now());

  // Ref mirror of text so the autosave interval can read the latest content
  // without re-creating the interval (and resetting its 5s timer) on every
  // keystroke.
  const textRef = useRef<string>("");
  const composingRef = useRef<boolean>(false);
  const scoreReqIdRef = useRef<number>(0);
  // Tracked caret position so each input event can record where the edit
  // landed. Updated on selection/keydown/click/focus.
  const lastCaretRef = useRef<number>(0);
  // Last time we hit /processScore (epoch ms). Throttled to once per 60s.
  const lastProcessScoreAtRef = useRef<number>(0);
  const [processScore, setProcessScore] = useState<number | null>(null);
  const [processClass, setProcessClass] = useState<
    "human" | "mixed" | "likelyAI" | null
  >(null);
  const [text, setText] = useState<string>("");
  const [sentences, setSentences] = useState<SentenceResult[]>([]);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiClass, setAiClass] = useState<string | null>(null);
  const [highlightingOn, setHighlightingOn] = useState<boolean>(true);
  const [pasteFlash, setPasteFlash] = useState<string | null>(null);
  const [showRedNotice, setShowRedNotice] = useState<boolean>(false);
  const [scoring, setScoring] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);

  const bucket = bucketOf(aiScore);

  // ---- Load existing canvas session ------------------------------------
  useEffect(() => {
    integrityApi
      .getCanvas(moduleId)
      .then((r) => {
        const s = r.session;
        if (s) {
          setText(s.content);
          textRef.current = s.content;
          if (editorRef.current) editorRef.current.textContent = s.content;
          if (Array.isArray(s.keystrokes))
            keystrokesRef.current = s.keystrokes as KeystrokeEvent[];
          if (Array.isArray(s.scoreHistory))
            scoreHistoryRef.current = s.scoreHistory as ScoreSample[];
          // Show last known score on resume
          const last = scoreHistoryRef.current.at(-1);
          if (last) {
            setAiScore(last.score);
            setAiClass(last.cls ?? null);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  // ---- Autosave every 5s (stable interval; reads textRef) --------------
  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      integrityApi
        .autosave(moduleId, {
          content: textRef.current,
          keystrokes: keystrokesRef.current,
          scoreHistory: scoreHistoryRef.current,
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [moduleId, loaded]);

  // ---- Red-state cumulative timer (1s tick) ----------------------------
  useEffect(() => {
    if (accommodated) return;
    const t = setInterval(() => {
      const now = Date.now();
      const dt = now - lastBucketTickRef.current;
      lastBucketTickRef.current = now;
      if (bucket === "red") {
        cumulativeRedMsRef.current += dt;
        if (
          cumulativeRedMsRef.current >= 30_000 &&
          !dismissedRedRef.current
        ) {
          setShowRedNotice(true);
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [bucket, accommodated]);

  // ---- Score request (debounced) ---------------------------------------
  const requestScore = useCallback(
    (latest: string) => {
      if (accommodated) return;
      if (!latest.trim() || latest.trim().length < 30) return;
      const myReqId = ++scoreReqIdRef.current;
      setScoring(true);
      integrityApi
        .score(moduleId, latest)
        .then((r) => {
          // Drop stale responses that arrived after a newer request was sent.
          if (myReqId !== scoreReqIdRef.current) return;
          if (r.aiScore != null) {
            setAiScore(r.aiScore);
            setAiClass(r.aiClass);
            setSentences(r.sentences ?? []);
            scoreHistoryRef.current.push({
              t: Date.now() - startRef.current,
              score: r.aiScore,
              cls: r.aiClass ?? "unknown",
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (myReqId !== scoreReqIdRef.current) return;
          setScoring(false);
          lastScoredAtRef.current = Date.now();
          lastScoredLenRef.current = latest.length;
        });
    },
    [moduleId, accommodated],
  );

  // ---- Live process-forensics score (throttled 1/60s) -----------------
  // Returns ONLY {score, class}. We deliberately don't surface the
  // individual feature names to the student — that would give a tuning
  // oracle to anyone testing the limits of the detector.
  const scheduleProcessScore = useCallback(
    (latest: string) => {
      if (accommodated) return;
      const now = Date.now();
      if (now - lastProcessScoreAtRef.current < 60_000) return;
      if (keystrokesRef.current.length < 20 || latest.length < 80) return;
      lastProcessScoreAtRef.current = now;
      integrityApi
        .processScore(moduleId, {
          events: keystrokesRef.current,
          content: latest,
        })
        .then((r) => {
          if (typeof r.score === "number") setProcessScore(r.score);
          else setProcessScore(null);
          setProcessClass(
            (r.class as "human" | "mixed" | "likelyAI" | null) ?? null,
          );
        })
        .catch(() => {});
    },
    [accommodated, moduleId],
  );

  const scheduleScore = useCallback(
    (latest: string) => {
      if (accommodated) return;
      if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
      const charsSince = latest.length - lastScoredLenRef.current;
      // Send immediately if we've added 200+ chars since last score; else 2s pause
      if (charsSince >= 200) {
        requestScore(latest);
      } else {
        scoreTimerRef.current = setTimeout(() => requestScore(latest), 2000);
      }
    },
    [accommodated, requestScore],
  );

  // ---- Editor event handlers -------------------------------------------
  function logKey(e: Omit<KeystrokeEvent, "t">) {
    keystrokesRef.current.push({
      t: Date.now() - startRef.current,
      ...e,
    });
  }

  /** Get caret end-position as a flat character offset, or null if unknown. */
  function caretOffset(el: HTMLElement): number | null {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0).cloneRange();
      r.selectNodeContents(el);
      r.setEnd(
        sel.getRangeAt(0).endContainer,
        sel.getRangeAt(0).endOffset,
      );
      return r.toString().length;
    } catch {
      return null;
    }
  }

  function handleInput() {
    if (composingRef.current) return; // wait for compositionend
    const el = editorRef.current;
    if (!el) return;
    const newText = el.innerText.replace(/\u00A0/g, " ");
    const prev = textRef.current;
    const caretAfter = caretOffset(el);
    if (newText.length > prev.length) {
      const delta = newText.length - prev.length;
      // Detect simple end-append vs middle insertion (selection replace etc).
      const appended = newText.slice(prev.length);
      const isAppend = newText.startsWith(prev);
      // For middle insertions we don't know the exact insert text without
      // a diff; the analyzer only needs the count anyway.
      const insertedText = isAppend ? appended : "";
      const caretBefore =
        caretAfter != null ? Math.max(0, caretAfter - delta) : lastCaretRef.current;
      logKey({
        k: isAppend ? "i" : "m",
        d: isAppend ? appended : `+${delta}`,
        type: "insert",
        pos: caretBefore,
        len: delta,
        charCount: delta,
        caretBefore,
        caretAfter,
        text: insertedText,
      });
    } else if (newText.length < prev.length) {
      const removed = prev.length - newText.length;
      const caretBefore =
        caretAfter != null ? caretAfter + removed : lastCaretRef.current;
      logKey({
        k: "d",
        d: String(removed),
        type: "delete",
        pos: caretBefore,
        len: removed,
        caretBefore,
        caretAfter,
      });
    } else if (newText !== prev) {
      logKey({ k: "m", type: "insert", caretBefore: caretAfter, caretAfter });
    }
    if (caretAfter != null) lastCaretRef.current = caretAfter;
    textRef.current = newText;
    setText(newText);
    scheduleScore(newText);
    scheduleProcessScore(newText);
  }

  function handleSelectionChange() {
    const el = editorRef.current;
    if (!el) return;
    const c = caretOffset(el);
    if (c == null) return;
    if (Math.abs(c - lastCaretRef.current) > 5) {
      logKey({ k: "m", type: "caretJump", pos: c, caretBefore: lastCaretRef.current, caretAfter: c });
    }
    lastCaretRef.current = c;
  }

  function handleCompositionStart() {
    composingRef.current = true;
  }
  function handleCompositionEnd() {
    composingRef.current = false;
    handleInput();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (accommodated) return;
    const pasted = e.clipboardData.getData("text/plain");
    if (pasted && pasted === internalClipRef.current) {
      logKey({ k: "p_allowed" });
      return; // allow native paste
    }
    e.preventDefault();
    logKey({ k: "p_blocked" });
    setPasteFlash(
      "Paste from outside the canvas is disabled. Please type your response.",
    );
    setTimeout(() => setPasteFlash(null), 3500);
  }

  function handleCopyOrCut(_e: React.ClipboardEvent<HTMLDivElement>) {
    const sel = window.getSelection?.()?.toString() ?? "";
    if (sel) internalClipRef.current = sel;
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (accommodated) return;
    e.preventDefault();
    logKey({ k: "p_blocked" });
    setPasteFlash("Drag-and-drop into the canvas is disabled.");
    setTimeout(() => setPasteFlash(null), 3500);
  }

  // ---- Highlighting overlay --------------------------------------------
  // Build HTML with sentence spans matched in order.
  function buildHighlightHtml(): string {
    if (!highlightingOn || sentences.length === 0 || accommodated)
      return escapeHtml(text);
    const out: string[] = [];
    let pos = 0;
    for (const s of sentences) {
      const idx = text.indexOf(s.text, pos);
      if (idx < 0) continue;
      if (idx > pos) out.push(escapeHtml(text.slice(pos, idx)));
      const cls =
        s.generatedProb >= 0.7
          ? "bg-red-200/80"
          : s.generatedProb >= 0.3
            ? "bg-amber-200/70"
            : "";
      if (cls) {
        out.push(`<span class="${cls} rounded-sm">`);
        out.push(escapeHtml(s.text));
        out.push("</span>");
      } else {
        out.push(escapeHtml(s.text));
      }
      pos = idx + s.text.length;
    }
    if (pos < text.length) out.push(escapeHtml(text.slice(pos)));
    // Trailing newline so the last line height matches the editor.
    return out.join("") + "\u200B";
  }

  // ---- Render -----------------------------------------------------------
  if (accommodated) {
    return (
      <Card data-testid="integrity-canvas">
        <CardHeader>
          <CardTitle className="font-serif text-lg">
            <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <Type className="h-3.5 w-3.5" />
              Box 2
            </span>
            Submission Canvas — type your final answer here
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Accommodated mode is active for your account. Paste prevention
            and AI monitoring are disabled. Your submission is recorded
            normally.
          </div>
          <textarea
            className="min-h-[300px] w-full resize-y rounded-md border border-stone-300 bg-white p-3 font-sans text-[15px] leading-relaxed text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              const prev = text;
              const target = e.target as HTMLTextAreaElement;
              const caretAfter =
                typeof target.selectionEnd === "number"
                  ? target.selectionEnd
                  : v.length;
              if (v.length > prev.length) {
                const delta = v.length - prev.length;
                const caretBefore = Math.max(0, caretAfter - delta);
                // Always emit rich event metadata even when live UI
                // monitoring is disabled — admin/server-side analysis
                // still benefits from the same shape signals.
                logKey({
                  k: "i",
                  d: v.slice(caretBefore, caretBefore + delta),
                  type: "insert",
                  pos: caretBefore,
                  len: delta,
                  charCount: delta,
                  caretBefore,
                  caretAfter,
                  text: v.slice(caretBefore, caretBefore + delta),
                });
              } else if (v.length < prev.length) {
                const removed = prev.length - v.length;
                logKey({
                  k: "d",
                  d: String(removed),
                  type: "delete",
                  pos: caretAfter,
                  len: removed,
                  caretBefore: caretAfter + removed,
                  caretAfter,
                });
              }
              setText(v);
            }}
            onSelect={(e) => {
              const target = e.target as HTMLTextAreaElement;
              const c = target.selectionEnd;
              if (typeof c !== "number") return;
              if (Math.abs(c - lastCaretRef.current) > 5) {
                logKey({
                  k: "m",
                  type: "caretJump",
                  pos: c,
                  caretBefore: lastCaretRef.current,
                  caretAfter: c,
                });
              }
              lastCaretRef.current = c;
            }}
            onFocus={() =>
              logKey({
                k: "m",
                type: "focus",
                caretBefore: lastCaretRef.current,
                caretAfter: lastCaretRef.current,
              })
            }
            onBlur={() =>
              logKey({
                k: "m",
                type: "blur",
                caretBefore: lastCaretRef.current,
                caretAfter: lastCaretRef.current,
              })
            }
            placeholder="Type your final answer here…"
            data-testid="input-canvas-accommodated"
          />
          <SubmitRow
            text={text}
            submitting={submitting}
            hasExisting={hasExistingSubmission}
            onSubmit={() => doSubmit(false)}
          />
        </CardContent>
      </Card>
    );
  }

  async function doSubmit(force: boolean) {
    if (!text.trim()) return;
    if (bucket === "red" && !force) {
      setConfirmOpen(true);
      return;
    }
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/submissions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId,
          content: text,
          keystrokes: keystrokesRef.current,
          scoreHistory: scoreHistoryRef.current,
          finalAiScore: aiScore,
          finalAiClass: aiClass,
          flaggedOnSubmit: bucket === "red",
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      toast.success("Submission saved");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card data-testid="integrity-canvas">
      <CardHeader>
        <CardTitle className="font-serif text-lg">
          <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Box 2
          </span>
          Submission Canvas — type your final answer here
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Traffic light bar */}
        <div className="space-y-1.5">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full bg-stone-200"
            data-testid="traffic-bar"
            data-bucket={bucket}
            aria-label={`AI detection: ${BUCKET_LABEL[bucket]}`}
          >
            <div
              className={`absolute inset-y-0 left-0 transition-all ${BUCKET_COLORS[bucket]}`}
              style={{
                width:
                  aiScore == null
                    ? "12%"
                    : `${Math.max(8, Math.round(aiScore * 100))}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-stone-600">
            <span data-testid="bucket-label">
              Text analysis: {BUCKET_LABEL[bucket]}
            </span>
            <span className="flex items-center gap-2">
              {scoring && (
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
              )}
              {aiScore != null && (
                <span data-testid="ai-score">
                  GPTZero: {(aiScore * 100).toFixed(0)}%
                </span>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-stone-300 px-1.5 py-0.5 text-[11px] hover:bg-stone-100"
                onClick={() => {
                  setHighlightingOn((v) => {
                    const next = !v;
                    logKey({ k: next ? "h_on" : "h_off" });
                    return next;
                  });
                }}
                data-testid="button-toggle-highlight"
              >
                {highlightingOn ? (
                  <>
                    <Eye className="h-3 w-3" />
                    Highlighting: ON
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Highlighting: OFF
                  </>
                )}
              </button>
            </span>
          </div>
        </div>

        {/* Process-forensics traffic light (writing-style sanity check) */}
        <ProcessBar
          score={processScore}
          cls={processClass}
        />

        {/* Editor stack: highlight overlay behind transparent contentEditable */}
        <div className="relative">
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words rounded-md border border-transparent p-3 font-sans text-[15px] leading-relaxed text-stone-900"
            dangerouslySetInnerHTML={{ __html: buildHighlightHtml() }}
          />
          <div
            ref={editorRef}
            // Use plaintext-only when supported (Chromium/WebKit); falls back
            // to true semantics elsewhere. Cast bypasses React's strict typing.
            contentEditable={"plaintext-only" as unknown as boolean}
            suppressContentEditableWarning
            spellCheck
            onInput={handleInput}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onPaste={handlePaste}
            onCopy={handleCopyOrCut}
            onCut={handleCopyOrCut}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onSelect={handleSelectionChange}
            onClick={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onFocus={() => {
              const el = editorRef.current;
              if (!el) return;
              const c = caretOffset(el);
              if (c != null) lastCaretRef.current = c;
              logKey({ k: "m", type: "focus", caretBefore: c, caretAfter: c });
            }}
            onBlur={() => {
              logKey({
                k: "m",
                type: "blur",
                caretBefore: lastCaretRef.current,
                caretAfter: lastCaretRef.current,
              });
            }}
            className={`relative min-h-[300px] w-full whitespace-pre-wrap break-words rounded-md border border-stone-300 bg-white p-3 font-sans text-[15px] leading-relaxed caret-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 ${
              highlightingOn ? "text-transparent" : "text-stone-900"
            }`}
            data-testid="input-canvas"
            data-placeholder="Type your final answer here…"
          />
        </div>

        {pasteFlash && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800"
            data-testid="paste-flash"
            role="alert"
          >
            {pasteFlash}
          </div>
        )}

        {showRedNotice && (
          <div
            className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            data-testid="red-notice"
            role="status"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              AI-generated content detected in your writing. Continuing to
              submit work flagged this way may negatively affect your grade.
              If you are not using AI, please review your writing approach to
              understand why the system is flagging this.
            </div>
            <button
              onClick={() => {
                dismissedRedRef.current = true;
                setShowRedNotice(false);
              }}
              className="text-red-700 hover:text-red-900"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <SubmitRow
          text={text}
          submitting={submitting}
          hasExisting={hasExistingSubmission}
          onSubmit={() => doSubmit(false)}
        />
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit flagged work?</AlertDialogTitle>
            <AlertDialogDescription>
              Your submission is currently flagged as likely AI-generated
              {aiScore != null && (
                <> (GPTZero score: {(aiScore * 100).toFixed(0)}%)</>
              )}
              . Submitting will send this to your instructor with the flag
              attached.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-go-back-revise">
              Go Back and Revise
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doSubmit(true)}
              data-testid="button-submit-anyway"
            >
              Submit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/**
 * Second traffic-light bar — writing-process score (writing-style sanity
 * check). Deliberately labeled generically so we don't tip off cheaters
 * to the specific signals the analyzer reads.
 */
function ProcessBar({
  score,
  cls,
}: {
  score: number | null;
  cls: "human" | "mixed" | "likelyAI" | null;
}) {
  const color =
    cls === "likelyAI"
      ? "bg-red-500"
      : cls === "mixed"
        ? "bg-amber-400"
        : cls === "human"
          ? "bg-emerald-500"
          : "bg-stone-300";
  const label =
    cls === "likelyAI"
      ? "Red — atypical writing pattern"
      : cls === "mixed"
        ? "Yellow — borderline writing pattern"
        : cls === "human"
          ? "Green — natural writing pattern"
          : "Writing-style check will activate after a few minutes of writing";
  return (
    <div className="space-y-1.5" data-testid="process-bar">
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-stone-200"
        data-bucket={cls ?? "neutral"}
        aria-label={`Writing-style check: ${label}`}
      >
        <div
          className={`absolute inset-y-0 left-0 transition-all ${color}`}
          style={{
            width:
              score == null ? "12%" : `${Math.max(8, Math.round(score))}%`,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-stone-600">
        <span>Writing-style check: {label}</span>
        {score != null && <span data-testid="process-score">{score}/100</span>}
      </div>
    </div>
  );
}

function SubmitRow({
  text,
  submitting,
  hasExisting,
  onSubmit,
}: {
  text: string;
  submitting: boolean;
  hasExisting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button
        onClick={onSubmit}
        disabled={submitting || !text.trim()}
        data-testid="button-submit"
      >
        {submitting ? "Submitting…" : hasExisting ? "Resubmit" : "Submit"}
      </Button>
      <span className="text-xs text-stone-500">
        Autosaves every 5 seconds. Resume from this device or another.
      </span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
