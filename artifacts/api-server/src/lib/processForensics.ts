/**
 * Writing-process forensics — a second AI-detection layer that scores the
 * SHAPE of a writing session (timing, deletions, caret motion, abandoned
 * starts), independently of the final text. Catches "transcription"
 * attacks where a student paraphrases AI text in another tab and types
 * it in slowly: the final text passes a text detector, but the process
 * fingerprint (uniform bursts, no deletions, no false starts) does not.
 *
 * This module is PURE — no DB, no I/O, no logging, no env. It must stay
 * that way so the synthetic diagnostic tests can call it directly.
 */

export interface ProcessEvent {
  /** Monotonic timestamp (ms epoch OR ms-since-start; we only use deltas). */
  t: number;
  /** Rich-format event type. */
  type?: "insert" | "delete" | "caretJump" | "focus" | "blur";
  /** Caret position at the time of the event. */
  pos?: number;
  /** Number of chars affected (0 for caret/focus/blur). */
  len?: number;
  /** Char count for inserts. */
  charCount?: number;
  caretBefore?: number | null;
  caretAfter?: number | null;
  /** Inserted text (kept short by the client). */
  text?: string;
  /** LEGACY: "i" | "d" | "m" | "p_blocked" | "p_allowed" | "h_off" | "h_on". */
  k?: string;
  /** LEGACY: inserted text (string) or delete count (string-of-number). */
  d?: string | number;
  p?: number;
}

export type ProcessClass = "human" | "mixed" | "likelyAI";

export interface ProcessFeatures {
  /** Stdev of inter-keystroke gaps inside bursts (ms). Low = robotic. */
  burstUniformity: number;
  /** Median ms from previous non-WS char to first non-WS char after .?! */
  pauseBeforeNewSentence: number;
  /** Same idea, but the gap must contain "\n\n". */
  pauseBeforeNewParagraph: number;
  /** Total deleted chars / total inserted chars. */
  deletionRatio: number;
  /** Count of "large or far-back" deletions (len ≥ 30 OR pos < docLen/2). */
  structuralEditCount: number;
  /** Backward caret jumps > 100 chars. */
  caretBacktrackCount: number;
  /** Bursts of ≥ 30 chars where ≥ 80% is deleted within 60s and the next
   *  insert lands within 10 chars of the burst's start caret. */
  abandonedStartCount: number;
  /** Coefficient of variation of burst lengths (stdev/mean). */
  burstLengthCV: number;
  /** Fraction of inserts that landed at end-of-doc. */
  frontToBackLinearity: number;
  /** Sum of inter-event gaps, capped at 30 s per gap. */
  totalActiveSeconds: number;
  /** Final length / totalActiveSeconds. */
  charsPerSecond: number;
}

export interface ProcessBaseline {
  n: number;
  features: Record<string, number>;
}

export interface ProcessAnalysis {
  processScore: number;
  processClass: ProcessClass;
  features: ProcessFeatures;
  flags: string[];
  baselineAdjustedScore?: number | null;
  baselineDeviation?: Record<string, number> | null;
}

/**
 * Per-feature weights (sum = 100). Each feature contributes a 0–100
 * "suspicion" sub-score; the final processScore is the weighted average.
 * Tune these here when adjusting the detector.
 */
export const WEIGHTS: Record<keyof ProcessFeatures, number> = {
  burstUniformity: 16,
  pauseBeforeNewSentence: 10,
  pauseBeforeNewParagraph: 6,
  deletionRatio: 14,
  structuralEditCount: 12,
  caretBacktrackCount: 10,
  abandonedStartCount: 12,
  burstLengthCV: 10,
  frontToBackLinearity: 6,
  totalActiveSeconds: 0,
  charsPerSecond: 4,
};

const CLASS_HUMAN_MAX = 35;
const CLASS_AI_MIN = 65;

// ============================================================================
// Public API
// ============================================================================

export function extractFeatures(
  events: ProcessEvent[],
  finalText: string,
): ProcessFeatures {
  const norm = events.map(normalizeEvent);
  const inserts = norm.filter((e) => e.kind === "insert");
  const deletes = norm.filter((e) => e.kind === "delete");

  const totalInsertedChars = inserts.reduce((s, e) => s + e.len, 0);
  const totalDeletedChars = deletes.reduce((s, e) => s + e.len, 0);

  const totalActiveSeconds = computeTotalActiveSeconds(norm);
  const charsPerSecond =
    totalActiveSeconds > 0
      ? finalText.length / totalActiveSeconds
      : 0;

  const bursts = groupIntoBursts(inserts);
  const burstUniformity = computeBurstUniformity(bursts);
  const burstLengthCV = computeBurstLengthCV(bursts);
  const abandonedStartCount = computeAbandonedStartCount(norm);
  const structuralEditCount = computeStructuralEditCount(norm);
  const caretBacktrackCount = computeCaretBacktrackCount(norm);
  const frontToBackLinearity = computeFrontToBackLinearity(norm);

  const perChar = buildPerCharTimestamps(norm);
  const sentencePause = computeSentencePause(perChar, finalText);
  const paragraphPause = computeParagraphPause(perChar, finalText);

  const deletionRatio =
    totalInsertedChars > 0 ? totalDeletedChars / totalInsertedChars : 0;

  return {
    burstUniformity,
    pauseBeforeNewSentence: sentencePause,
    pauseBeforeNewParagraph: paragraphPause,
    deletionRatio,
    structuralEditCount,
    caretBacktrackCount,
    abandonedStartCount,
    burstLengthCV,
    frontToBackLinearity,
    totalActiveSeconds,
    charsPerSecond,
  };
}

export function analyzeProcess(
  events: ProcessEvent[],
  finalText: string,
): ProcessAnalysis {
  const features = extractFeatures(events, finalText);
  const { score, flags } = scoreFeatures(features);
  return {
    processScore: score,
    processClass: classOf(score),
    features,
    flags,
    baselineAdjustedScore: null,
    baselineDeviation: null,
  };
}

export function analyzeProcessWithBaseline(
  events: ProcessEvent[],
  finalText: string,
  baseline: ProcessBaseline | null,
): ProcessAnalysis {
  const base = analyzeProcess(events, finalText);
  if (!baseline || baseline.n === 0) return base;

  const deviation = compareToBaseline(base.features, baseline);
  // Recompute the weighted suspicion sum, but soften features that closely
  // match this student's baseline (a student whose baseline burstUniformity
  // is 12 ms isn't "robotic" for them).
  let weightSum = 0;
  let suspSum = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ProcessFeatures)[]) {
    const w = WEIGHTS[key];
    if (w <= 0) continue;
    const sub = subScore(key, base.features[key]);
    if (sub == null) continue;
    const devRatio = Math.abs(deviation[key] ?? 0);
    // closeness=1 if equal to baseline, 0 if ≥ 50% off
    const closeness = Math.max(0, 1 - Math.min(devRatio, 0.5) / 0.5);
    const soften = closeness * 0.7; // up to 70% reduction
    suspSum += w * sub * (1 - soften);
    weightSum += w;
  }
  const baselineAdjustedScore =
    weightSum > 0 ? Math.round(suspSum / weightSum) : null;
  // Once the baseline is frozen (n ≥ 2), the adjusted score becomes the
  // AUTHORITATIVE verdict — that's the whole point of having a per-student
  // baseline. The raw score and class are still recoverable via
  // base.processScore / base.processClass for admin debugging if anyone
  // needs them, but persistence/classification flows downstream from this
  // function consume processScore/processClass.
  if (baseline.n >= 2 && baselineAdjustedScore != null) {
    return {
      ...base,
      processScore: baselineAdjustedScore,
      processClass: classOf(baselineAdjustedScore),
      baselineAdjustedScore,
      baselineDeviation: deviation,
    };
  }
  return { ...base, baselineAdjustedScore, baselineDeviation: deviation };
}

export function foldIntoBaseline(
  baseline: ProcessBaseline | null,
  features: ProcessFeatures,
): ProcessBaseline {
  const prevN = baseline?.n ?? 0;
  const prev = baseline?.features ?? {};
  const nextN = prevN + 1;
  const nextFeatures: Record<string, number> = {};
  for (const key of Object.keys(features) as (keyof ProcessFeatures)[]) {
    const v = features[key];
    if (!Number.isFinite(v)) {
      nextFeatures[key] = prev[key] ?? 0;
      continue;
    }
    const prior = prev[key] ?? v;
    nextFeatures[key] = (prior * prevN + v) / nextN;
  }
  return { n: nextN, features: nextFeatures };
}

export function compareToBaseline(
  features: ProcessFeatures,
  baseline: ProcessBaseline | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!baseline) return out;
  for (const key of Object.keys(features) as (keyof ProcessFeatures)[]) {
    const cur = features[key];
    const base = baseline.features[key];
    if (!Number.isFinite(cur) || !Number.isFinite(base)) {
      out[key] = 0;
      continue;
    }
    if (Math.abs(base) < 1e-9) {
      out[key] = cur === 0 ? 0 : 1;
      continue;
    }
    out[key] = (cur - base) / Math.abs(base);
  }
  return out;
}

// ============================================================================
// Internals
// ============================================================================

interface NormalizedEvent {
  t: number;
  kind: "insert" | "delete" | "caretJump" | "focus" | "blur" | "other";
  len: number;
  text: string;
  pos: number | null;
  caretBefore: number | null;
  caretAfter: number | null;
}

function normalizeEvent(e: ProcessEvent): NormalizedEvent {
  let kind: NormalizedEvent["kind"] = "other";
  if (e.type) {
    kind = e.type;
  } else if (e.k === "i") kind = "insert";
  else if (e.k === "d") kind = "delete";
  else if (e.k === "m") kind = "insert"; // best-effort mapping for legacy mixed events

  const text =
    typeof e.text === "string"
      ? e.text
      : typeof e.d === "string" && Number.isNaN(Number(e.d))
        ? e.d
        : "";

  let len = 0;
  if (typeof e.len === "number") len = e.len;
  else if (typeof e.charCount === "number") len = e.charCount;
  else if (text) len = text.length;
  else if (typeof e.d === "number") len = e.d;
  else if (typeof e.d === "string") {
    const n = Number(e.d);
    if (Number.isFinite(n)) len = n;
    else len = e.d.length;
  } else if (kind === "delete") len = 1;

  return {
    t: e.t,
    kind,
    len: Math.max(0, len),
    text,
    pos: typeof e.pos === "number" ? e.pos : null,
    caretBefore: typeof e.caretBefore === "number" ? e.caretBefore : null,
    caretAfter: typeof e.caretAfter === "number" ? e.caretAfter : null,
  };
}

function computeTotalActiveSeconds(events: NormalizedEvent[]): number {
  if (events.length < 2) return 0;
  let totalMs = 0;
  for (let i = 1; i < events.length; i++) {
    const dt = events[i]!.t - events[i - 1]!.t;
    if (dt <= 0) continue;
    totalMs += Math.min(dt, 30_000);
  }
  return totalMs / 1000;
}

interface Burst {
  events: NormalizedEvent[];
  startT: number;
  endT: number;
  charCount: number;
  startCaret: number | null;
}

function groupIntoBursts(inserts: NormalizedEvent[]): Burst[] {
  const out: Burst[] = [];
  let cur: Burst | null = null;
  const GAP_MS = 1500;
  for (const e of inserts) {
    if (!cur || e.t - cur.endT > GAP_MS) {
      cur = {
        events: [e],
        startT: e.t,
        endT: e.t,
        charCount: e.len,
        startCaret: e.caretBefore,
      };
      out.push(cur);
    } else {
      cur.events.push(e);
      cur.endT = e.t;
      cur.charCount += e.len;
    }
  }
  return out;
}

function computeBurstUniformity(bursts: Burst[]): number {
  // Stdev of inter-event gaps inside bursts. Low = robotic.
  const gaps: number[] = [];
  for (const b of bursts) {
    for (let i = 1; i < b.events.length; i++) {
      const dt = b.events[i]!.t - b.events[i - 1]!.t;
      if (dt > 0) gaps.push(dt);
    }
  }
  if (gaps.length < 2) return Number.NaN;
  return stdev(gaps);
}

function computeBurstLengthCV(bursts: Burst[]): number {
  if (bursts.length < 2) return Number.NaN;
  const lens = bursts.map((b) => b.charCount);
  const m = mean(lens);
  if (m === 0) return 0;
  return stdev(lens) / m;
}

function computeStructuralEditCount(events: NormalizedEvent[]): number {
  let n = 0;
  let docLen = 0;
  for (const e of events) {
    if (e.kind === "insert") {
      docLen += e.len;
    } else if (e.kind === "delete") {
      const isLarge = e.len >= 30;
      const pos = e.caretBefore ?? e.pos ?? docLen;
      const isFarBack = docLen > 0 && pos < docLen / 2;
      if (isLarge || isFarBack) n++;
      docLen = Math.max(0, docLen - e.len);
    }
  }
  return n;
}

function computeCaretBacktrackCount(events: NormalizedEvent[]): number {
  let n = 0;
  let lastCaret: number | null = null;
  for (const e of events) {
    const c = e.caretAfter ?? e.caretBefore ?? e.pos;
    if (c == null) continue;
    if (lastCaret != null && c < lastCaret - 100) n++;
    lastCaret = c;
  }
  return n;
}

function computeAbandonedStartCount(events: NormalizedEvent[]): number {
  // Burst of ≥ 30 chars where ≥ 80% is deleted within 60s, AND the next
  // insert (after the deletes) lands within 10 chars of the burst's start
  // caret. Per the spec, when caretBefore is null on a candidate, CONTINUE
  // (don't break) — legacy/mixed streams have some events without caret data.
  const inserts = events.filter((e) => e.kind === "insert");
  const bursts = groupIntoBursts(inserts);
  let n = 0;
  for (let bi = 0; bi < bursts.length; bi++) {
    const b = bursts[bi]!;
    if (b.charCount < 30) continue;

    // Sum deletes that happen within 60s of burst end.
    let deletedSoon = 0;
    for (const e of events) {
      if (e.kind !== "delete") continue;
      if (e.t < b.endT) continue;
      if (e.t > b.endT + 60_000) break;
      deletedSoon += e.len;
    }
    if (deletedSoon < 0.8 * b.charCount) continue;

    // Next insert after the deletion window.
    const nextInsert = inserts.find(
      (e) => e.t > b.endT && (e.caretBefore == null || e.caretBefore >= 0),
    );
    if (!nextInsert) continue;
    if (b.startCaret == null || nextInsert.caretBefore == null) {
      // Per spec, missing caret data means we can't disprove — continue,
      // i.e. don't count it but don't break either. We simply skip incrementing.
      continue;
    }
    if (Math.abs(nextInsert.caretBefore - b.startCaret) > 10) continue;
    n++;
  }
  return n;
}

function computeFrontToBackLinearity(events: NormalizedEvent[]): number {
  let docLen = 0;
  let total = 0;
  let atEnd = 0;
  for (const e of events) {
    if (e.kind !== "insert") {
      if (e.kind === "delete") docLen = Math.max(0, docLen - e.len);
      continue;
    }
    total++;
    const pos = e.caretBefore ?? e.pos;
    if (pos == null || pos >= docLen - 1) atEnd++;
    docLen += e.len;
  }
  if (total === 0) return Number.NaN;
  return atEnd / total;
}

function buildPerCharTimestamps(events: NormalizedEvent[]): number[] {
  const ts: number[] = [];
  for (const e of events) {
    if (e.kind === "insert") {
      const cnt = e.len > 0 ? e.len : e.text.length;
      if (cnt <= 0) continue;
      let pos = e.caretBefore != null ? e.caretBefore : ts.length;
      pos = Math.max(0, Math.min(pos, ts.length));
      const arr: number[] = new Array(cnt).fill(e.t);
      ts.splice(pos, 0, ...arr);
    } else if (e.kind === "delete") {
      const len = e.len > 0 ? e.len : 1;
      const pos = e.caretBefore != null ? e.caretBefore : ts.length;
      const start = Math.max(0, pos - len);
      ts.splice(start, len);
    }
  }
  return ts;
}

function computeSentencePause(perChar: number[], finalText: string): number {
  // Walk finalText; for each terminator, find next non-WS char and previous
  // non-WS char, look up their timestamps, take median of gaps.
  if (perChar.length === 0 || finalText.length === 0) return Number.NaN;
  // If reconstruction length doesn't match, skip — feature not computable.
  if (perChar.length !== finalText.length) return Number.NaN;

  const pauses: number[] = [];
  for (let i = 0; i < finalText.length; i++) {
    const ch = finalText[i]!;
    if (ch !== "." && ch !== "?" && ch !== "!") continue;
    // find previous non-WS index (must be the terminator itself or earlier)
    // Prev non-WS == i (the terminator counts as non-WS).
    const prev = i;
    // find next non-WS after i (skipping whitespace including newlines)
    let j = i + 1;
    while (j < finalText.length && /\s/.test(finalText[j]!)) j++;
    if (j >= finalText.length) continue;
    const prevT = perChar[prev];
    const nextT = perChar[j];
    if (prevT == null || nextT == null) continue;
    const dt = nextT - prevT;
    if (dt <= 0) continue;
    pauses.push(dt);
  }
  if (pauses.length === 0) return Number.NaN;
  return median(pauses);
}

function computeParagraphPause(perChar: number[], finalText: string): number {
  if (perChar.length !== finalText.length || finalText.length === 0)
    return Number.NaN;
  const pauses: number[] = [];
  for (let i = 0; i < finalText.length - 1; i++) {
    if (finalText[i] !== "\n" || finalText[i + 1] !== "\n") continue;
    // previous non-WS before this \n\n
    let prev = i - 1;
    while (prev >= 0 && /\s/.test(finalText[prev]!)) prev--;
    if (prev < 0) continue;
    let next = i + 2;
    while (next < finalText.length && /\s/.test(finalText[next]!)) next++;
    if (next >= finalText.length) continue;
    const prevT = perChar[prev];
    const nextT = perChar[next];
    if (prevT == null || nextT == null) continue;
    const dt = nextT - prevT;
    if (dt > 0) pauses.push(dt);
  }
  if (pauses.length === 0) return Number.NaN;
  return median(pauses);
}

// --- Scoring -----------------------------------------------------------------

function scoreFeatures(f: ProcessFeatures): {
  score: number;
  flags: string[];
} {
  let weightSum = 0;
  let suspSum = 0;
  const flags: string[] = [];
  for (const key of Object.keys(WEIGHTS) as (keyof ProcessFeatures)[]) {
    const w = WEIGHTS[key];
    if (w <= 0) continue;
    const sub = subScore(key, f[key]);
    if (sub == null) continue;
    weightSum += w;
    suspSum += w * sub;
    if (sub >= 60) {
      const flag = flagFor(key, f[key], sub);
      if (flag) flags.push(flag);
    }
  }
  const score =
    weightSum > 0 ? Math.round(suspSum / weightSum) : 0;
  return { score, flags };
}

function classOf(score: number): ProcessClass {
  if (score < CLASS_HUMAN_MAX) return "human";
  if (score >= CLASS_AI_MIN) return "likelyAI";
  return "mixed";
}

/**
 * Map a feature value to a 0–100 "suspicion" score. Returns null when the
 * feature could not be computed (NaN / undefined) so it is excluded from
 * both numerator and denominator of the weighted average.
 */
function subScore(
  feature: keyof ProcessFeatures,
  value: number,
): number | null {
  if (!Number.isFinite(value)) return null;
  switch (feature) {
    case "burstUniformity": {
      // <10ms stdev → 100, >100ms → 0
      if (value <= 10) return 100;
      if (value >= 100) return 0;
      return Math.round(100 - ((value - 10) / 90) * 100);
    }
    case "pauseBeforeNewSentence": {
      if (value <= 100) return 100;
      if (value >= 2000) return 0;
      return Math.round(100 - ((value - 100) / 1900) * 100);
    }
    case "pauseBeforeNewParagraph": {
      if (value <= 200) return 100;
      if (value >= 5000) return 0;
      return Math.round(100 - ((value - 200) / 4800) * 100);
    }
    case "deletionRatio": {
      // Healthy human band ~ 0.10–0.45.
      if (value < 0.05) return 90;
      if (value < 0.10) return Math.round(90 - ((value - 0.05) / 0.05) * 90);
      if (value <= 0.45) return 0;
      if (value >= 1.5) return 30;
      return Math.round(((value - 0.45) / 1.05) * 30);
    }
    case "structuralEditCount": {
      if (value <= 0) return 100;
      if (value === 1) return 50;
      if (value === 2) return 20;
      return 0;
    }
    case "caretBacktrackCount": {
      if (value <= 0) return 100;
      if (value === 1) return 50;
      if (value === 2) return 20;
      return 0;
    }
    case "abandonedStartCount": {
      // Real composition has at least one false start in any non-trivial piece.
      if (value <= 0) return 70;
      return 0;
    }
    case "burstLengthCV": {
      if (value <= 0.2) return 100;
      if (value >= 0.6) return 0;
      return Math.round(100 - ((value - 0.2) / 0.4) * 100);
    }
    case "frontToBackLinearity": {
      if (value >= 0.95) return 100;
      if (value <= 0.7) return 0;
      return Math.round(((value - 0.7) / 0.25) * 100);
    }
    case "charsPerSecond": {
      if (value >= 6) return 80;
      if (value <= 3) return 0;
      return Math.round(((value - 3) / 3) * 80);
    }
    case "totalActiveSeconds":
      return null; // informational only
  }
  return null;
}

function flagFor(
  feature: keyof ProcessFeatures,
  value: number,
  _sub: number,
): string | null {
  switch (feature) {
    case "burstUniformity":
      return `Burst uniformity is ${Math.round(value)} ms (transcription-like — real typing varies more).`;
    case "pauseBeforeNewSentence":
      return `Median pause before a new sentence is ${Math.round(value)} ms (humans usually pause longer to think).`;
    case "pauseBeforeNewParagraph":
      return `Median pause before a new paragraph is ${Math.round(value)} ms (very short for a paragraph break).`;
    case "deletionRatio":
      if (value < 0.10)
        return `Deletion ratio is ${(value * 100).toFixed(1)}% (almost no edits — real drafts have many).`;
      return `Deletion ratio is ${(value * 100).toFixed(1)}% (unusually high — possible churn).`;
    case "structuralEditCount":
      return `${value} structural edits (humans typically make several large or far-back revisions).`;
    case "caretBacktrackCount":
      return `${value} long caret backtracks (humans typically jump back to revise multiple times).`;
    case "abandonedStartCount":
      return `${value} abandoned-and-restarted starts (humans usually false-start at least once).`;
    case "burstLengthCV":
      return `Burst-length variation is ${value.toFixed(2)} (uniform burst sizes are transcription-like).`;
    case "frontToBackLinearity":
      return `${Math.round(value * 100)}% of inserts landed at end-of-doc (real composition revisits earlier text).`;
    case "charsPerSecond":
      return `Sustained typing rate is ${value.toFixed(1)} chars/sec (very fast for organic composition).`;
  }
  return null;
}

// --- Math helpers ------------------------------------------------------------

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0)
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}
