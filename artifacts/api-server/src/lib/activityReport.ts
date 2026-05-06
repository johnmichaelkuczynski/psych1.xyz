/**
 * Compute the suspicious-activity report for a finished submission from
 * the captured keystroke + score-history streams.
 *
 * Event shapes (compact for storage):
 *   keystroke:  { t: ms_since_start, k: 'i' | 'd' | 'm' | 'p_blocked' | 'p_allowed', d?: string, p?: number }
 *   scoreSample:{ t: ms_since_start, score: number, cls: string }
 */

export interface ActivityReport {
  /** Cumulative ms the bar spent in the red bucket. */
  redMs: number;
  /** Sustained red >2 minutes total */
  sustainedRed: boolean;
  /** Max words-per-minute in any 30s sliding window. */
  peakWpm30s: number;
  /** Sustained typing >120 WPM for 30s+. */
  burstTyping: boolean;
  /** Number of (long-pause >60s) → (long-burst) transitions. */
  pasteishBursts: number;
  /** Count of paste-from-outside attempts (blocked). */
  pastesBlocked: number;
  /** Times the bar transitioned green→red. */
  greenToRedTransitions: number;
  /** Did the student turn highlighting off while bar was yellow/red? */
  highlightingOffWhileFlagged: boolean;
  /** Total typing duration in ms (first to last event). */
  totalDurationMs: number;
  /** Total characters added (insert events). */
  totalInserts: number;
  /** Total characters deleted. */
  totalDeletes: number;
}

type Event = { t: number; k: string; d?: string; p?: number };
type Score = { t: number; score: number; cls?: string };

function bucketOf(score: number): "green" | "yellow" | "red" {
  if (score >= 0.7) return "red";
  if (score >= 0.3) return "yellow";
  return "green";
}

export function computeActivityReport(
  keystrokes: unknown,
  scoreHistory: unknown,
): ActivityReport {
  const ks: Event[] = Array.isArray(keystrokes)
    ? (keystrokes as Event[]).filter((e) => e && typeof e.t === "number")
    : [];
  const ss: Score[] = Array.isArray(scoreHistory)
    ? (scoreHistory as Score[]).filter(
        (s) => s && typeof s.t === "number" && typeof s.score === "number",
      )
    : [];
  ks.sort((a, b) => a.t - b.t);
  ss.sort((a, b) => a.t - b.t);

  // --- Red time + green→red transitions ---
  let redMs = 0;
  let greenToRedTransitions = 0;
  let lastBucket: "green" | "yellow" | "red" | null = null;
  for (let i = 0; i < ss.length; i++) {
    const cur = ss[i];
    const next = ss[i + 1];
    const dt = next ? Math.max(0, next.t - cur.t) : 0;
    const b = bucketOf(cur.score);
    if (b === "red") redMs += dt;
    if (lastBucket && lastBucket !== "red" && b === "red")
      greenToRedTransitions++;
    lastBucket = b;
  }

  // --- WPM windows (30s, slide by 5s) over insert events ---
  const inserts = ks.filter((e) => e.k === "i");
  let peakWpm30s = 0;
  if (inserts.length > 1) {
    const maxT = inserts[inserts.length - 1].t;
    for (let start = 0; start <= maxT; start += 5_000) {
      const end = start + 30_000;
      const charsInWindow = inserts.filter(
        (e) => e.t >= start && e.t < end,
      ).length;
      const wpm = (charsInWindow / 5) / (30 / 60); // 5 chars≈1 word, scaled to per-min
      if (wpm > peakWpm30s) peakWpm30s = wpm;
    }
  }

  // --- Long-pause→burst pattern ---
  let pasteishBursts = 0;
  for (let i = 1; i < inserts.length; i++) {
    const gap = inserts[i].t - inserts[i - 1].t;
    if (gap >= 60_000) {
      // Did a "burst" of fluent text follow? count chars in next 30s
      const burstStart = inserts[i].t;
      const burstChars = inserts.filter(
        (e) => e.t >= burstStart && e.t < burstStart + 30_000,
      ).length;
      if (burstChars >= 200) pasteishBursts++;
    }
  }

  // --- Highlighting hidden while bar was yellow/red ---
  // Walk h_off/h_on toggles and check whether any flagged score window
  // overlapped with a "highlighting OFF" interval.
  let highlightingOff = false;
  let highlightingHidWhileFlagged = false;
  // Build a list of [startMs, endMs] intervals when highlighting was OFF.
  const offIntervals: Array<[number, number]> = [];
  let offStart: number | null = null;
  const finalT = ks.length > 0 ? ks[ks.length - 1].t : 0;
  for (const e of ks) {
    if (e.k === "h_off" && offStart === null) {
      offStart = e.t;
      highlightingOff = true;
    } else if (e.k === "h_on" && offStart !== null) {
      offIntervals.push([offStart, e.t]);
      offStart = null;
    }
  }
  if (offStart !== null) offIntervals.push([offStart, finalT]);
  if (offIntervals.length > 0) {
    for (let i = 0; i < ss.length && !highlightingHidWhileFlagged; i++) {
      const cur = ss[i];
      const next = ss[i + 1];
      const sStart = cur.t;
      const sEnd = next ? next.t : finalT;
      const flagged = bucketOf(cur.score) !== "green";
      if (!flagged) continue;
      for (const [a, b] of offIntervals) {
        if (a < sEnd && b > sStart) {
          highlightingHidWhileFlagged = true;
          break;
        }
      }
    }
  }
  void highlightingOff;

  const pastesBlocked = ks.filter((e) => e.k === "p_blocked").length;
  const totalInserts = inserts.length;
  const totalDeletes = ks.filter((e) => e.k === "d").length;
  const totalDurationMs =
    ks.length > 0 ? Math.max(0, ks[ks.length - 1].t - ks[0].t) : 0;

  return {
    redMs,
    sustainedRed: redMs >= 120_000,
    peakWpm30s: Math.round(peakWpm30s),
    burstTyping: peakWpm30s >= 120,
    pasteishBursts,
    pastesBlocked,
    greenToRedTransitions,
    highlightingOffWhileFlagged: highlightingHidWhileFlagged,
    totalDurationMs,
    totalInserts,
    totalDeletes,
  };
}
