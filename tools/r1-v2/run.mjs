#!/usr/bin/env node
// =============================================================================
// R1-v2 — SYNTHETIC-STUDENT BETA-TESTER FOR PSYCHOLOGY 101
// =============================================================================
// Single-file Playwright harness. See README.md for the build-spec mapping
// and the 12 invariants A–L.
//
// Sections (top-to-bottom):
//   CONFIG → OUTPUT DIR + LOGGER → ANTHROPIC → LIVE VIEW SERVER →
//   NETWORK CAPTURE → SSE CAPTURE → WRITER BRAIN → JUDGE BRAIN →
//   INVARIANT VERIFIERS (A–L) → HELPERS → INTERACTION RECORDER →
//   AUTH HELPERS → FUNCTION DRIVERS (F1–F18) → REPORT BUILDERS →
//   SANITY CHECK → MAIN
// =============================================================================

import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import {
  promises as fsp,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIG
// =============================================================================

const APP_URL          = process.env.APP_URL          || "http://localhost:80";
const APP_BASE         = (process.env.APP_BASE        || "").replace(/\/$/, "");
const API_URL          = process.env.API_URL          || "http://localhost:8080";
const HEADLESS         = String(process.env.HEADLESS  || "false").toLowerCase() === "true";
const MAX_MODULES      = Math.max(1, Math.min(12, parseInt(process.env.MAX_MODULES || "3", 10)));
const TYPE_DELAY_MS    = parseInt(process.env.TYPE_DELAY_MS || "15", 10);
const LIVE_VIEW_PORT   = parseInt(process.env.LIVE_VIEW_PORT || "7777", 10);
const ANTHROPIC_MODEL  = process.env.ANTHROPIC_MODEL  || "claude-sonnet-4-5";
const JUDGE_MODEL      = process.env.JUDGE_MODEL      || ANTHROPIC_MODEL;
const CLAUDE_TIMEOUT_MS= parseInt(process.env.CLAUDE_TIMEOUT_MS || "120000", 10);
const TUTOR_TIMEOUT_MS = parseInt(process.env.TUTOR_TIMEOUT_MS || "60000", 10);
const AI_CHECK_POLL_TIMEOUT_MS = parseInt(process.env.AI_CHECK_POLL_TIMEOUT_MS || "60000", 10);
const R1_ADMIN_EMAIL   = process.env.R1_ADMIN_EMAIL   || null;
const SKIP_FUNCTIONS   = new Set((process.env.SKIP_FUNCTIONS || "").split(",").map(s => s.trim()).filter(Boolean));

const RUN_TS           = new Date().toISOString().replace(/[:.]/g, "-");
const STAMP            = Date.now();
const R1_REGULAR_EMAIL = `r1-regular-${STAMP}@beta.local`;
const R1_REGULAR_NAME  = "R1 Regular Student";
const R1_ADMIN_AUTOEMAIL = `r1-admin-${STAMP}@beta.local`;
const R1_ADMIN_NAME    = "R1 Admin";
const R1_ACCOMM_EMAIL  = `r1-accomm-${STAMP}@beta.local`;
const R1_ACCOMM_NAME   = "R1 Accommodated";

// Curriculum order — MUST match the server's lib/curriculum.ts. Module IDs
// are not numeric; sequential gating cares about array order in curriculum.ts.
const CURRICULUM_ORDER = ["d1","e1","d2","e2","d3","e3","d4","e4","d5","e5","d6","d7","tp"];

const FORBIDDEN_LEAK_KEYS = new Set([
  "processFeatures", "processFlags",
  "__baselineAdjustedScore", "__baselineDeviation",
  "__baselineSnapshot", "__baselineN",
  // feature names per processForensics.ts:
  "linearProgress", "meanInterBurstGap", "burstSpeed",
  "abandonedStarts", "structuralDeletes", "caretBacktracks",
]);

// =============================================================================
// OUTPUT DIR + LOGGER
// =============================================================================

const RUN_DIR        = path.join(__dirname, "runs", RUN_TS);
const SCREENSHOT_DIR = path.join(RUN_DIR, "screenshots");
const SSE_DIR        = path.join(RUN_DIR, "sse-streams");
const OUTPUTS_DIR    = path.join(RUN_DIR, "outputs");
const OUT_DIAG       = path.join(OUTPUTS_DIR, "diagnostics");
const OUT_SUB        = path.join(OUTPUTS_DIR, "submissions");
const OUT_PSCORE     = path.join(OUTPUTS_DIR, "process-scores");
const OUT_SFACE      = path.join(OUTPUTS_DIR, "student-facing-responses");
const OUT_BASELINE   = path.join(OUTPUTS_DIR, "baseline-snapshots");
const OUT_TUTOR      = path.join(OUTPUTS_DIR, "tutor-conversations");
for (const d of [SCREENSHOT_DIR, SSE_DIR, OUT_DIAG, OUT_SUB, OUT_PSCORE, OUT_SFACE, OUT_BASELINE, OUT_TUTOR]) {
  mkdirSync(d, { recursive: true });
}

const consoleStream    = createWriteStream(path.join(RUN_DIR, "console.log"),    { flags: "a" });
const transcriptStream = createWriteStream(path.join(RUN_DIR, "transcript.jsonl"),{ flags: "a" });
const networkStream    = createWriteStream(path.join(RUN_DIR, "network.log"),    { flags: "a" });

function ts() { return new Date().toISOString(); }
function log(...args) {
  const line = `[${ts()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  process.stdout.write(line + "\n");
  consoleStream.write(line + "\n");
}
function logErr(...args) {
  const line = `[${ts()}] !! ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  process.stderr.write(line + "\n");
  consoleStream.write(line + "\n");
}

// Run-global state — surfaced in run-summary, failures.md, and exit code
const CRITICAL = {                                  // keyed by invariant letter
  A: [], B: [], C: [], D: [], E: [], F: [],
  G: [], H: [], I: [], J: [], K: [], L: [],
};
const OTHER_CRITICAL = [];                          // 5xx, diagnostic regression, uncaught harness errors
const SANITY_FAILURES = [];
const ATTEMPTED_FUNCTIONS = new Set();
const SKIPPED_REASONS = {};
const PROCESS_SCORE_RESPONSES = [];                 // every live processScore body, for F18 aggregate audit

// =============================================================================
// ANTHROPIC
// =============================================================================

function makeAnthropic() {
  if (process.env.ANTHROPIC_API_KEY) {
    log("Anthropic: using direct ANTHROPIC_API_KEY");
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
    log(`Anthropic: using Replit-managed proxy at ${process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL}`);
    return new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "replit-managed",
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  throw new Error(
    "Anthropic credentials required: set ANTHROPIC_API_KEY OR " +
    "AI_INTEGRATIONS_ANTHROPIC_BASE_URL (+ AI_INTEGRATIONS_ANTHROPIC_API_KEY).",
  );
}
const anthropic = makeAnthropic();

function withTimeout(promise, ms, label) {
  let to;
  const timeoutP = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(to));
}

function parseJsonLoose(text) {
  if (text == null) throw new Error("empty reply");
  const t = String(text).trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const first = t.indexOf("{"); const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch {} }
  throw new Error("could not parse JSON");
}

// =============================================================================
// LIVE VIEW SERVER (port 7777)
// =============================================================================

const liveState = {
  ts: ts(),
  finished: false,
  config: { APP_URL, APP_BASE, HEADLESS, MAX_MODULES, TYPE_DELAY_MS, model: ANTHROPIC_MODEL },
  current_function: null,
  current_module: null,
  current_student: null,                            // "regular" | "admin" | "accommodated" | "anonymous"
  current_url: null,
  r1_approach: null,
  r1_reasoning: null,
  r1_input_so_far: "",
  latest_screenshot: null,
  latest_calls: [],
  latest_page_text: "",
  latest_judge: "",
  // Psych 101 state surface
  latest_process_score_body: null,                  // VISIBLE FOR INVARIANT A
  latest_submissions_shape: null,                   // VISIBLE FOR INVARIANT B
  keystroke_count: 0,
  char_count: 0,
  forensics_eligible: false,
  last_ai_status: null,
  time_since_pending_ms: null,
  diagnostic_status: null,
  // SSE
  sse_event_count: 0,
  sse_last_delta_at: null,
  sse_terminal: null,
  // accommodated check
  accommodated_score_calls: 0,
  accommodated_processscore_calls: 0,
  accommodated_ui_present: null,
  // counters
  interactions_complete: 0,
  judge_concerns_total: 0,
  critical_count: 0,
  sanity_count: 0,
  // tail of completed interactions
  recent_interactions: [],
  run_summary: null,
};

let liveServer = null;

function startLiveServer() {
  liveServer = http.createServer((req, res) => {
    if (req.url === "/state") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(liveState));
      return;
    }
    if (req.url && req.url.startsWith("/screenshot/")) {
      const rel = req.url.slice("/screenshot/".length);
      const abs = path.join(SCREENSHOT_DIR, path.basename(rel));
      try {
        const buf = readFileSync(abs);
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(buf);
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(LIVE_HTML);
  });
  liveServer.listen(LIVE_VIEW_PORT, () => log(`Live view: http://localhost:${LIVE_VIEW_PORT}`));
}

const LIVE_HTML = `<!doctype html><meta charset="utf-8"><title>R1-v2 Live View</title>
<style>
  *{box-sizing:border-box}
  body{font:13px/1.4 -apple-system,system-ui,sans-serif;margin:0;background:#0d1117;color:#c9d1d9}
  header{background:#161b22;padding:10px 16px;border-bottom:1px solid #30363d}
  h1{margin:0;font-size:14px;font-weight:600}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0;height:calc(100vh - 42px)}
  .panel{padding:12px 16px;overflow:auto;border:0 solid #30363d}
  .panel + .panel{border-left-width:1px}
  .bottom{grid-column:1/3;border-top:1px solid #30363d;max-height:30vh}
  h2{font-size:11px;text-transform:uppercase;color:#8b949e;margin:0 0 6px;font-weight:600;letter-spacing:.5px}
  pre{margin:4px 0 10px;background:#161b22;padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-word;font-size:11px;max-height:200px;overflow:auto}
  .kv{display:grid;grid-template-columns:170px 1fr;gap:2px 8px;margin:4px 0 10px;font-size:11px}
  .kv b{color:#8b949e;font-weight:500}
  img{max-width:100%;border:1px solid #30363d;border-radius:4px}
  .call{font-size:11px;border-left:3px solid #30363d;padding:4px 8px;margin:4px 0;background:#0d1117}
  .call.ok{border-color:#3fb950}.call.warn{border-color:#d29922}.call.err{border-color:#f85149}
  .leak{background:#3d1c1c;border:1px solid #f85149;color:#ffabab;padding:6px;border-radius:4px;font-size:11px;margin:4px 0}
  .ok{color:#3fb950}.warn{color:#d29922}.err{color:#f85149}
  .pill{display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;background:#21262d;margin-right:4px}
</style>
<header><h1>R1-v2 Live View · <span id="ts"></span></h1></header>
<div class="grid">
  <div class="panel">
    <h2>Current step</h2>
    <div class="kv">
      <b>function</b><div id="fn"></div>
      <b>module</b><div id="mod"></div>
      <b>student</b><div id="stu"></div>
      <b>url</b><div id="url"></div>
      <b>diagnostic</b><div id="diag"></div>
    </div>
    <h2>R1 reasoning</h2>
    <pre id="reason"></pre>
    <h2>R1 input so far</h2>
    <pre id="input"></pre>
    <h2>Latest screenshot</h2>
    <img id="shot" alt="latest">
  </div>
  <div class="panel">
    <h2>Psych 101 state</h2>
    <div class="kv">
      <b>keystroke / chars</b><div id="kc"></div>
      <b>forensics eligible</b><div id="elig"></div>
      <b>last aiStatus</b><div id="ai"></div>
      <b>SSE events / terminal</b><div id="sse"></div>
      <b>accommodated UI</b><div id="acc"></div>
      <b>accommodated score calls</b><div id="acccalls"></div>
    </div>
    <h2 class="warn">⚠ Latest processScore body (Invariant A surface)</h2>
    <pre id="psbody"></pre>
    <h2 class="warn">⚠ Latest /api/submissions shape (Invariant B surface)</h2>
    <pre id="subshape"></pre>
    <h2>Latest /api/* calls</h2>
    <div id="calls"></div>
    <h2>Latest judge critique</h2>
    <pre id="judge"></pre>
  </div>
  <div class="panel bottom">
    <h2>Counters</h2>
    <div class="kv">
      <b>interactions complete</b><div id="ic"></div>
      <b>judge concerns total</b><div id="jc"></div>
      <b>critical invariant violations</b><div id="cv" class="err"></div>
      <b>sanity failures</b><div id="sf" class="warn"></div>
    </div>
    <h2>Recent interactions</h2>
    <pre id="recent"></pre>
    <h2 id="summary-h">Run summary</h2>
    <pre id="summary"></pre>
  </div>
</div>
<script>
async function tick() {
  try {
    const s = await fetch("/state",{cache:"no-store"}).then(r=>r.json());
    document.getElementById("ts").textContent = s.ts;
    document.getElementById("fn").textContent = s.current_function || "(idle)";
    document.getElementById("mod").textContent = s.current_module || "—";
    document.getElementById("stu").textContent = s.current_student || "—";
    document.getElementById("url").textContent = s.current_url || "—";
    document.getElementById("diag").textContent = s.diagnostic_status || "—";
    document.getElementById("reason").textContent = (s.r1_approach || "") + " — " + (s.r1_reasoning || "");
    document.getElementById("input").textContent = s.r1_input_so_far || "";
    document.getElementById("shot").src = s.latest_screenshot ? "/screenshot/" + s.latest_screenshot.split("/").pop() + "?t=" + Date.now() : "";
    document.getElementById("kc").textContent = s.keystroke_count + " events / " + s.char_count + " chars";
    document.getElementById("elig").innerHTML = s.forensics_eligible ? '<span class="ok">eligible (≥20 ev AND ≥80 ch)</span>' : '<span class="warn">below threshold</span>';
    document.getElementById("ai").textContent = (s.last_ai_status || "—") + (s.time_since_pending_ms != null ? " · " + s.time_since_pending_ms + " ms" : "");
    document.getElementById("sse").textContent = s.sse_event_count + " · " + (s.sse_terminal || "—") + (s.sse_last_delta_at ? " · last " + s.sse_last_delta_at : "");
    document.getElementById("acc").textContent = s.accommodated_ui_present == null ? "—" : (s.accommodated_ui_present ? "accommodated textarea" : "hardened canvas");
    document.getElementById("acccalls").innerHTML = (s.accommodated_score_calls + s.accommodated_processscore_calls === 0) ? '<span class="ok">0 (good)</span>' : '<span class="err">'+ (s.accommodated_score_calls + s.accommodated_processscore_calls) +' (INVARIANT H VIOLATION)</span>';
    document.getElementById("psbody").textContent = s.latest_process_score_body ? JSON.stringify(s.latest_process_score_body, null, 2) : "(none yet)";
    document.getElementById("subshape").textContent = s.latest_submissions_shape ? JSON.stringify(s.latest_submissions_shape, null, 2) : "(none yet)";
    const calls = (s.latest_calls || []).map(c => {
      const cls = c.status >= 500 ? "err" : c.status >= 400 ? "warn" : "ok";
      let leak = "";
      if (c.process_score_leak && c.process_score_leak.length) leak = '<div class="leak">A-LEAK: ' + c.process_score_leak.join(", ") + '</div>';
      return '<div class="call '+cls+'"><b>'+c.method+'</b> '+c.url+' → '+c.status+'<br>'+(c.body_preview||"").slice(0,300)+leak+'</div>';
    }).join("");
    document.getElementById("calls").innerHTML = calls || "(no calls captured this step)";
    document.getElementById("judge").textContent = s.latest_judge || "(none)";
    document.getElementById("ic").textContent = s.interactions_complete;
    document.getElementById("jc").textContent = s.judge_concerns_total;
    document.getElementById("cv").textContent = s.critical_count;
    document.getElementById("sf").textContent = s.sanity_count;
    document.getElementById("recent").textContent = (s.recent_interactions || []).join("\\n");
    document.getElementById("summary").textContent = s.run_summary || (s.finished ? "(no summary)" : "(in progress)");
    document.getElementById("summary-h").textContent = s.finished ? "Run summary (FINISHED)" : "Run summary";
  } catch (e) {}
  setTimeout(tick, 900);
}
tick();
</script>`;

// =============================================================================
// NETWORK CAPTURE (per-context buffer, exposed as currentNetBuffer below)
// =============================================================================

let currentNetBuffer = [];
let consoleErrors    = [];
const pendingByReq = new WeakMap();

function isApiUrl(u) {
  try { return new URL(u).pathname.startsWith("/api/"); } catch { return false; }
}

function bodyExceededMax(bufLen) { return bufLen > 50 * 1024; }

function attachNetworkCapture(page, label = "regular") {
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => consoleErrors.push(`pageerror: ${err.message}`));

  page.on("request", req => {
    const url = req.url();
    if (!isApiUrl(url)) return;
    let body = null;
    try { body = req.postData(); } catch {}
    pendingByReq.set(req, { method: req.method(), url, ts: Date.now(), requestBody: body, ctx: label });
  });

  page.on("response", async resp => {
    const req = resp.request();
    const meta = pendingByReq.get(req);
    if (!meta) return;
    pendingByReq.delete(req);
    let respBody = ""; let truncated = false;
    try {
      const buf = await resp.body();
      if (bodyExceededMax(buf.length)) { respBody = buf.slice(0, 50 * 1024).toString("utf8"); truncated = true; }
      else { respBody = buf.toString("utf8"); }
    } catch (e) {
      respBody = `<failed to read body: ${e.message}>`;
    }
    const rec = {
      ts: new Date(meta.ts).toISOString(),
      method: meta.method,
      url: meta.url,
      status: resp.status(),
      duration_ms: Date.now() - meta.ts,
      request_body: (meta.requestBody || "").slice(0, 4000),
      response_body: respBody,
      response_truncated: truncated,
      ctx: meta.ctx,
    };
    // Invariant A live surface — every processScore response, even outside record()
    if (/\/api\/canvas\/[^/]+\/processScore(?:[?#].*)?$/.test(rec.url) && rec.method === "POST") {
      let parsed = null;
      try { parsed = JSON.parse(rec.response_body || "{}"); } catch {}
      const leak = computeProcessScoreLeak(parsed);
      rec.process_score_leak = leak;
      rec.process_score_body = parsed;
      PROCESS_SCORE_RESPONSES.push({ url: rec.url, ts: rec.ts, body: parsed, leak, ctx: rec.ctx });
      try {
        await fsp.writeFile(
          path.join(OUT_PSCORE, `${rec.ts.replace(/[:.]/g,"-")}-${rec.ctx}.json`),
          JSON.stringify({ url: rec.url, body: parsed, leak }, null, 2),
        );
      } catch {}
      if (leak.length > 0) {
        CRITICAL.A.push({ url: rec.url, leak, ctx: rec.ctx, body_preview: rec.response_body.slice(0, 400) });
      }
      liveState.latest_process_score_body = parsed;
    }
    currentNetBuffer.push(rec);
    networkStream.write(JSON.stringify(rec) + "\n");
    const previewCalls = currentNetBuffer.slice(-6).map(c => ({
      method: c.method, url: c.url, status: c.status,
      body_preview: (c.response_body || "").slice(0, 280),
      process_score_leak: c.process_score_leak || null,
    }));
    liveState.latest_calls = previewCalls;
  });
}

function computeProcessScoreLeak(body) {
  if (!body || typeof body !== "object") return [];
  const allowed = new Set(["score", "class"]);
  const extra = [];
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) extra.push(k);
    if (FORBIDDEN_LEAK_KEYS.has(k)) extra.push(`FORBIDDEN:${k}`);
  }
  return [...new Set(extra)];
}

// =============================================================================
// SSE CAPTURE — Playwright doesn't give us streaming response bodies, so we
// patch fetch+EventSource inside the page to mirror SSE deltas into a global
// array we can poll. Used by Function 9 (tutor).
// =============================================================================

async function installSseProbe(page) {
  await page.addInitScript(() => {
    window.__R1_SSE = [];
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");
      const resp = await origFetch.apply(this, args);
      try {
        const ct = (resp.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("text/event-stream") || /\/api\/tutor\/[^/]+\/message/.test(url)) {
          const clone = resp.clone();
          (async () => {
            const reader = clone.body && clone.body.getReader();
            if (!reader) return;
            const decoder = new TextDecoder();
            let buf = "";
            const sessionId = `sse-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
            window.__R1_SSE.push({ t: Date.now(), type: "open", url, session: sessionId });
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) { window.__R1_SSE.push({ t: Date.now(), type: "close", session: sessionId }); break; }
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf("\n\n")) >= 0) {
                  const evt = buf.slice(0, idx); buf = buf.slice(idx + 2);
                  for (const line of evt.split("\n")) {
                    if (line.startsWith("data:")) {
                      const data = line.slice(5).trim();
                      window.__R1_SSE.push({ t: Date.now(), type: "data", session: sessionId, data });
                    }
                  }
                }
              }
            } catch (e) {
              window.__R1_SSE.push({ t: Date.now(), type: "error", session: sessionId, error: String(e) });
            }
          })();
        }
      } catch {}
      return resp;
    };
  });
}

async function drainSseEvents(page) {
  try {
    const events = await page.evaluate(() => {
      const out = (window.__R1_SSE || []).slice();
      window.__R1_SSE = [];
      return out;
    });
    return events || [];
  } catch { return []; }
}

// =============================================================================
// WRITER BRAIN
// =============================================================================

const APPROACHES = [
  { id: "competent_thorough",   description: "A well-formed, on-topic Psychology answer that should pass cleanly." },
  { id: "weak_off_topic",       description: "An on-topic-looking answer that misses the actual prompt." },
  { id: "minimal_terse",        description: "Bare-minimum length to test what the system tolerates." },
  { id: "ai_voice_obvious",     description: "Deliberately AI-sounding cadence to provoke the detectors." },
  { id: "human_voice_with_typos", description: "Conversational with realistic typos and 1+ self-correction in parens." },
];

async function writerBrain({ functionName, moduleId, reading, assignment, hint }) {
  const approachesText = APPROACHES.map(a => `- ${a.id}: ${a.description}`).join("\n");
  const sys = `You are R1-v2, a synthetic Psychology 101 student beta-testing a course app. Your job is to deliberately EXERCISE the app's behavior — not to ace the assignment. Pick exactly ONE approach from this list:

${approachesText}

Stay on topic. 250–600 words (150–300 for minimal_terse). For human_voice_with_typos: include 3–6 realistic typos and at least 1 self-correction in parens. For ai_voice_obvious: very even cadence, "Furthermore," / "It is important to note,". Never break persona by saying "I am an AI".

Return STRICT JSON with exactly these keys:
{"approach": "<id from list>", "reasoning": "<1-2 sentences>", "answer": "<verbatim text R1 will type>"}`;

  const userMsg = `FUNCTION: ${functionName}
MODULE: ${moduleId}
HINT FROM HARNESS: ${hint || "(none)"}
READING (first 3500 chars):
${(reading || "(none captured)").slice(0, 3500)}

ASSIGNMENT PROMPT:
${(assignment || "(none captured)").slice(0, 1800)}`;

  try {
    const m = await withTimeout(
      anthropic.messages.create({
        model: ANTHROPIC_MODEL, max_tokens: 1800, system: sys,
        messages: [{ role: "user", content: userMsg }],
      }),
      CLAUDE_TIMEOUT_MS, "writer brain",
    );
    const text = m.content[0]?.text || "";
    try {
      const parsed = parseJsonLoose(text);
      if (!parsed.approach || !parsed.answer) throw new Error("missing fields");
      return parsed;
    } catch {
      return fallbackAnswer(functionName, moduleId, assignment);
    }
  } catch (e) {
    logErr(`writer brain error: ${e.message}; using fallback`);
    return fallbackAnswer(functionName, moduleId, assignment);
  }
}

function fallbackAnswer(fn, moduleId, assignment) {
  return {
    approach: "competent_thorough",
    reasoning: "Fallback path: writer brain unavailable or unparseable.",
    answer: `This response engages with the Psychology 101 module ${moduleId} prompt: ${(assignment || "(prompt not captured)").slice(0, 300)}. The fallback text exists so the harness can still exercise the full submission pipeline even when the writer brain is unreachable. The answer here is deliberately middle-of-the-road in length and structure: a thesis sentence, two supporting paragraphs, and a brief acknowledgement of the strongest objection. Researchers studying this kind of question have produced a substantial literature, and a real student answer would cite at least one of those studies by name. For the purposes of this beta test, the surface area — paragraph count, word count, and use of a clear topic sentence — is enough to drive every server-side check that fires on POST /api/submissions and on the live integrity canvas.`,
  };
}

// =============================================================================
// JUDGE BRAIN
// =============================================================================

async function judgeBrain(record) {
  const sys = `You are a senior pedagogy + product reviewer auditing a college Psychology 101 course app. You are NOT grading the student. You are reviewing the COURSE APP's behavior given what R1 did. Read the raw evidence and produce STRICT JSON:

{"critique": "<2-5 sentence prose paragraph judging the app's behavior in this interaction>", "concerns": ["<specific evidence-backed string>", ...]}

Be specific. Examples of good concerns:
- "POST /api/canvas/d1/processScore returned feature names — Invariant A violation."
- "Tutor produced a complete submittable essay when asked to ghostwrite."
- "Draft Workshop did not lock after feedback returned."
- "Submission card never appeared after POST /api/submissions returned 201."
- "Accommodated student still triggered POST /api/canvas/:m/score calls."

Empty array if nothing concerning. Do NOT moralize about R1's answer quality — focus on the APP.`;

  const calls = (record.app_response.network_calls || []).slice(0, 25).map(c =>
    `- ${c.method} ${c.url} → ${c.status} (${c.duration_ms}ms)\n  req: ${(c.request_body||"").slice(0,200)}\n  res: ${(c.response_body||"").slice(0,300)}`
  ).join("\n");

  const userMsg = `FUNCTION: F${record.function_number} ${record.function_name}
MODULE: ${record.module_id || "(none)"}
STEP: ${record.step_description}
URL: ${record.url}
CONTEXT: ${record.context || "regular"}

R1 APPROACH: ${record.r1_approach || "(read-only)"}
R1 REASONING: ${record.r1_reasoning || "(read-only)"}

R1 INPUT (first 3500 chars):
${(record.r1_input || "(none)").slice(0, 3500)}

PAGE TEXT AFTER (first 3500 chars):
${(record.app_response.page_text_after || "").slice(0, 3500)}

INVARIANT RESULTS (deterministic):
${(record.invariant_results || []).map(r => `${r.invariant}: ${r.passed ? "PASS" : "FAIL"} — ${r.note || ""}`).join("\n") || "(none evaluated)"}

NETWORK CALLS:
${calls || "(no /api/* calls captured)"}

BROWSER CONSOLE ERRORS:
${(record.app_response.errors_in_console || []).slice(0, 10).join("\n") || "(none)"}`;

  try {
    const m = await withTimeout(
      anthropic.messages.create({
        model: JUDGE_MODEL, max_tokens: 1200, system: sys,
        messages: [{ role: "user", content: userMsg }],
      }),
      CLAUDE_TIMEOUT_MS, "judge brain",
    );
    const text = m.content[0]?.text || "";
    try {
      const parsed = parseJsonLoose(text);
      record.judge_critique = String(parsed.critique || "").trim();
      record.judge_concerns = Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [];
    } catch {
      record.judge_critique = text;
      record.judge_concerns = ["judge_unparseable_response"];
    }
  } catch (e) {
    record.judge_critique = `(judge error: ${e.message})`;
    record.judge_concerns = ["judge_call_failed"];
  }
  liveState.latest_judge = record.judge_critique;
  liveState.judge_concerns_total += record.judge_concerns.length;
}

// =============================================================================
// INVARIANT VERIFIERS
// =============================================================================
// Each returns { invariant: "A".."L", passed: bool, note: string, evidence: any }.
// Critical-bucket population happens in the caller / runtime.

function inv_A_processScore_leak(record) {
  const calls = (record.app_response.network_calls || []).filter(c =>
    /\/api\/canvas\/[^/]+\/processScore(?:[?#].*)?$/.test(c.url) && c.method === "POST");
  if (!calls.length) return { invariant: "A", passed: true, note: "no processScore calls in this step", evidence: null };
  const violations = [];
  for (const c of calls) {
    let body = null; try { body = JSON.parse(c.response_body || "{}"); } catch {}
    const leak = computeProcessScoreLeak(body);
    if (leak.length) violations.push({ url: c.url, leak, body });
  }
  const passed = violations.length === 0;
  if (!passed) for (const v of violations) CRITICAL.A.push(v);
  return { invariant: "A", passed, note: passed
    ? `${calls.length} processScore call(s) verified, no leaks`
    : `${violations.length} LEAK(S): ${JSON.stringify(violations.map(v=>v.leak))}`,
    evidence: violations };
}

function inv_B_studentFacing_strips(record) {
  const calls = (record.app_response.network_calls || []).filter(c => {
    if (c.method !== "GET") return false;
    if (!/\/api\/submissions(\/module\/[^/]+)?(?:[?#].*)?$/.test(c.url)) return false;
    if (/\/api\/admin\//.test(c.url)) return false;
    return true;
  });
  if (!calls.length) return { invariant: "B", passed: true, note: "no student-facing submissions calls this step", evidence: null };
  const violations = [];
  for (const c of calls) {
    const txt = c.response_body || "";
    const leaked = ["processScore","processClass","processFeatures","processFlags"]
      .filter(k => txt.includes(`"${k}"`));
    if (leaked.length) violations.push({ url: c.url, leaked });
  }
  const passed = violations.length === 0;
  if (!passed) for (const v of violations) CRITICAL.B.push(v);
  // surface to live view
  if (calls.length) {
    try {
      const j = JSON.parse(calls[calls.length-1].response_body || "null");
      const sample = Array.isArray(j) ? (j[0] || null) : (j?.submission || j);
      liveState.latest_submissions_shape = sample ? Object.keys(sample) : null;
    } catch {}
  }
  return { invariant: "B", passed, note: passed
    ? `${calls.length} student-facing response(s) inspected, no process* leak`
    : `${violations.length} response(s) leaked: ${JSON.stringify(violations)}`,
    evidence: violations };
}

function inv_F_tutorSse(record, sseEvents) {
  // Stream opens <5s after the POST, ≥1 delta, terminal done:true.
  const dataEvents = sseEvents.filter(e => e.type === "data");
  if (!sseEvents.length) {
    CRITICAL.F.push({ note: "no SSE events captured for tutor message" });
    return { invariant: "F", passed: false, note: "0 SSE events", evidence: null };
  }
  const openAt = sseEvents.find(e => e.type === "open");
  const close  = sseEvents.find(e => e.type === "close");
  const errored= sseEvents.find(e => e.type === "error");
  const lastData = dataEvents[dataEvents.length - 1];
  let terminal = "(none)";
  if (errored) terminal = "error";
  else if (lastData) {
    try {
      const j = JSON.parse(lastData.data);
      if (j && j.done === true) terminal = "done:true";
      else if (j && j.error) terminal = "error:"+j.error;
    } catch {}
  }
  liveState.sse_event_count = sseEvents.length;
  liveState.sse_terminal = terminal;
  if (dataEvents.length) liveState.sse_last_delta_at = new Date(dataEvents[dataEvents.length-1].t).toISOString();
  const passed = dataEvents.length >= 1 && (terminal === "done:true" || !!close);
  if (!passed) CRITICAL.F.push({ note: `tutor SSE lifecycle broken: ${dataEvents.length} deltas, terminal=${terminal}`, sample: sseEvents.slice(-5) });
  return { invariant: "F", passed, note: `${sseEvents.length} events / ${dataEvents.length} deltas / terminal=${terminal}`, evidence: { sample_tail: sseEvents.slice(-5) } };
}

function inv_L_hotPath_201(record) {
  // For F6 (d1 happy submit), expect 201 within 5s with aiStatus="pending".
  const submitCalls = (record.app_response.network_calls || []).filter(c =>
    /\/api\/submissions(?:[?#].*)?$/.test(c.url) && c.method === "POST");
  if (!submitCalls.length) return { invariant: "L", passed: true, note: "no POST /api/submissions this step", evidence: null };
  const violations = [];
  for (const c of submitCalls) {
    if (c.status !== 201) { violations.push(`POST /submissions returned ${c.status} (expected 201)`); continue; }
    if (c.duration_ms > 5000) { violations.push(`POST /submissions took ${c.duration_ms}ms (>5000)`); }
    try {
      const body = JSON.parse(c.response_body || "{}");
      if (body.aiStatus !== "pending") violations.push(`POST /submissions returned aiStatus=${body.aiStatus} (expected pending)`);
    } catch (e) { violations.push(`POST /submissions body unparseable: ${e.message}`); }
  }
  const passed = violations.length === 0;
  if (!passed) for (const v of violations) CRITICAL.L.push({ note: v });
  return { invariant: "L", passed, note: passed
    ? `${submitCalls.length} submission(s) returned 201 fast with aiStatus=pending`
    : violations.join("; "),
    evidence: violations };
}

// Inv C, D, E, G, H, I, J, K are evaluated inside their dedicated function
// drivers (where the structural context is needed) and push into CRITICAL[X].

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function appUrl(p) {
  const base = APP_URL.replace(/\/$/, "") + (APP_BASE ? "/" + APP_BASE.replace(/^\//,"") : "");
  return base + (p.startsWith("/") ? p : "/" + p);
}

async function dismissDisclosureIfPresent(page) {
  try {
    const btn = page.locator('[data-testid="button-ack-integrity"]');
    if (await btn.count() > 0 && await btn.first().isVisible({ timeout: 500 }).catch(()=>false)) {
      await btn.first().click({ timeout: 2000 }).catch(()=>{});
      await sleep(300);
    }
  } catch {}
}

async function snapTo(page, label, idx) {
  const safe = String(idx).padStart(4, "0");
  const rel  = `screenshots/${safe}-${label}.png`;
  const abs  = path.join(RUN_DIR, rel);
  try {
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(()=>{});
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(()=>{});
    await sleep(200);
    await page.screenshot({ path: abs, fullPage: false });
    liveState.latest_screenshot = rel;
    return rel;
  } catch (e) {
    logErr(`screenshot ${rel} failed: ${e.message}`);
    return null;
  }
}

async function getPageText(page) {
  try { return await page.locator("body").innerText({ timeout: 2500 }); }
  catch { return ""; }
}

function loadFixture(name) {
  try { return readFileSync(path.join(__dirname, "fixtures", name), "utf8"); }
  catch (e) { logErr(`fixture ${name} missing: ${e.message}`); return ""; }
}

async function persistSubmission(rec) {
  try { await fsp.writeFile(path.join(OUT_SUB, `${rec.moduleId}-${rec.id}.json`), JSON.stringify(rec, null, 2)); }
  catch (e) { logErr(`persistSubmission ${rec.id}: ${e.message}`); }
}

async function persistSubmissionsList(label, body) {
  try { await fsp.writeFile(path.join(OUT_SFACE, `${Date.now()}-${label}.json`), typeof body === "string" ? body : JSON.stringify(body, null, 2)); }
  catch {}
}

// Context-level helper: fire a fetch from inside a Playwright BrowserContext
// so its cookies travel. Returns { status, body (string), bodyJson? }.
async function ctxFetch(context, method, urlPath, body) {
  const opts = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) opts.data = body;
  const r = await context.request.fetch(appUrl(urlPath), opts);
  const status = r.status();
  let text = ""; try { text = await r.text(); } catch {}
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status, text, json };
}

// =============================================================================
// INTERACTION RECORDER
// =============================================================================

let interactionCounter = 0;

async function record(page, meta, { navigate, act, postCheck } = {}) {
  interactionCounter += 1;
  ATTEMPTED_FUNCTIONS.add(meta.function_number);
  const idx = interactionCounter;

  currentNetBuffer = [];
  consoleErrors = [];
  liveState.current_function = `F${meta.function_number} ${meta.function_name}`;
  liveState.current_module = meta.module_id || null;
  liveState.current_student = meta.context || "regular";
  liveState.r1_approach = null;
  liveState.r1_reasoning = null;
  liveState.r1_input_so_far = "";
  liveState.latest_calls = [];
  liveState.latest_judge = "";
  liveState.keystroke_count = 0;
  liveState.char_count = 0;
  liveState.forensics_eligible = false;

  const inlineFailures = [];
  log(`-- #${idx} F${meta.function_number} ${meta.function_name}${meta.module_id ? " · "+meta.module_id : ""}${meta.suffix ? " — "+meta.suffix : ""} --`);

  if (navigate) {
    try {
      await navigate();
      await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(()=>{});
      if (meta.dismiss_disclosure !== false) await dismissDisclosureIfPresent(page);
    } catch (e) {
      logErr(`navigate failed: ${e.message}`);
      inlineFailures.push(`INLINE-WARN navigate: ${e.message}`);
    }
  }
  liveState.current_url = page.url();

  const screenshots = [];
  screenshots.push(await snapTo(page, "before", idx));

  let r1Approach = null, r1Reasoning = null, r1Input = "";
  let isInteractive = false;
  if (act) {
    isInteractive = true;
    try {
      const r = await act();
      if (r && typeof r === "object") {
        r1Approach  = r.approach  || null;
        r1Reasoning = r.reasoning || null;
        r1Input     = r.answer    || r.input || "";
      } else if (typeof r === "string") r1Input = r;
    } catch (e) {
      logErr(`act failed: ${e.message}`);
      inlineFailures.push(`INLINE-WARN act: ${e.message}`);
    }
  }
  liveState.r1_approach = r1Approach;
  liveState.r1_reasoning = r1Reasoning;
  liveState.r1_input_so_far = r1Input;
  if (isInteractive) screenshots.push(await snapTo(page, "after-typing", idx));

  // Post-act settle, capture page state
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(()=>{});
  await sleep(300);
  if (isInteractive) screenshots.push(await snapTo(page, "after-response", idx));
  const pageText = await getPageText(page);

  const record = {
    interaction_index: idx,
    ts: ts(),
    function_number: meta.function_number,
    function_name: meta.function_name,
    module_id: meta.module_id || null,
    context: meta.context || "regular",
    step_description: meta.step || meta.function_name,
    url: page.url(),
    is_interactive: isInteractive,
    r1_approach: r1Approach,
    r1_reasoning: r1Reasoning,
    r1_input: r1Input,
    expected_routes: meta.expected_routes || [],
    app_response: {
      page_text_after: pageText,
      network_calls: currentNetBuffer.slice(),
      errors_in_console: consoleErrors.slice(),
    },
    screenshots,
    inline_failures: inlineFailures,
    invariant_results: [],
    judge_critique: "",
    judge_concerns: [],
  };

  // Default invariant runs that apply to every step:
  record.invariant_results.push(inv_A_processScore_leak(record));
  record.invariant_results.push(inv_B_studentFacing_strips(record));

  // Hot-path L applies only when a POST /api/submissions happened
  const sawSubmit = record.app_response.network_calls.some(c =>
    /\/api\/submissions(?:[?#].*)?$/.test(c.url) && c.method === "POST");
  if (sawSubmit) record.invariant_results.push(inv_L_hotPath_201(record));

  // Verify expected_routes
  for (const er of (meta.expected_routes || [])) {
    const re = er.url instanceof RegExp ? er.url : new RegExp(er.url);
    const matches = record.app_response.network_calls.filter(c =>
      c.method === er.method.toUpperCase() && re.test(c.url));
    if (matches.length === 0) {
      const others = record.app_response.network_calls.slice(0, 6)
        .map(c => `${c.method} ${c.url}`).join(", ");
      const msg = `expected ${er.method} ${re} but 0 matched (saw: ${others || "no /api/* calls"})`;
      record.inline_failures.push(`INLINE-FAIL ${msg}`);
      logErr(`   INLINE-FAIL ${msg}`);
    }
  }

  // Optional caller-supplied checker
  if (postCheck) {
    try { await postCheck(record); }
    catch (e) { logErr(`postCheck failed: ${e.message}`); record.inline_failures.push(`POSTCHECK ERR: ${e.message}`); }
  }

  // 5xx + diagnostic regression-style hard fails surfaced as OTHER_CRITICAL
  for (const c of record.app_response.network_calls) {
    if (c.status >= 500) {
      OTHER_CRITICAL.push({ kind: "5xx", url: c.url, status: c.status, body: c.response_body.slice(0,300) });
    }
  }

  // Judge
  await judgeBrain(record);
  if (record.judge_concerns.length) log(`   judge concerns: ${record.judge_concerns.length}`);

  // Persist
  transcriptStream.write(JSON.stringify(record) + "\n");

  liveState.interactions_complete += 1;
  liveState.critical_count = totalCritical();
  liveState.sanity_count = SANITY_FAILURES.length;
  liveState.recent_interactions = (liveState.recent_interactions || []).concat([`#${idx} F${meta.function_number} ${meta.function_name}${meta.module_id?` · ${meta.module_id}`:""} → ${record.judge_concerns.length} concerns, ${record.inline_failures.length} failures`]).slice(-12);
  return record;
}

function totalCritical() {
  let n = OTHER_CRITICAL.length;
  for (const k of Object.keys(CRITICAL)) n += CRITICAL[k].length;
  return n;
}

// =============================================================================
// AUTH HELPERS
// =============================================================================

async function loginUI(page, email, name) {
  await page.goto(appUrl("/"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(()=>{});
  const emailLoc = page.locator('[data-testid="input-email"]').first();
  const nameLoc  = page.locator('[data-testid="input-name"]').first();
  if (await emailLoc.count() === 0) {
    // already logged in, or markup differs — try /start-here
    await page.goto(appUrl("/start-here"), { waitUntil: "domcontentloaded" });
    await sleep(500);
  }
  await page.locator('[data-testid="input-email"]').first().fill(email);
  await page.locator('[data-testid="input-name"]').first().fill(name);
  const [resp] = await Promise.all([
    page.waitForResponse(r => /\/api\/auth\/login/.test(r.url()) && r.request().method() === "POST", { timeout: 10000 }).catch(()=>null),
    page.locator('[data-testid="button-login"]').first().click(),
  ]);
  await sleep(800);
  return resp ? resp.status() : null;
}

async function loginDirect(context, email, name) {
  return await ctxFetch(context, "POST", "/api/auth/login", JSON.stringify({ email, name }));
}

async function bootstrapAdmin(context) {
  // POST /api/admin/bootstrap — first authenticated caller becomes admin if none.
  return await ctxFetch(context, "POST", "/api/admin/bootstrap", "{}");
}

async function meCall(context) {
  return await ctxFetch(context, "GET", "/api/auth/me");
}

// =============================================================================
// FUNCTION DRIVERS
// =============================================================================

const FN_NAMES = {
  1: "Diagnostic system check (mandatory)",
  2: "Health + Auth + cross-context",
  3: "Syllabus + module grid",
  4: "Integrity disclosure gate (Inv J)",
  5: "Sequential gating (Inv C)",
  6: "d1 happy path (draft → canvas → submit → poll)",
  7: "Sparse-data submission (Inv E)",
  8: "Paste-block verification",
  9: "Tutor SSE + critique (Inv F)",
  10: "Inline AI actions",
  11: "Multi-submission baseline freeze (Inv D)",
  12: "Accommodated mode (Inv H)",
  13: "Admin enforcement (Inv I)",
  14: "Term paper module",
  15: "Polling badge",
  16: "Diagnostic regression (final)",
  17: "Edge cases",
  18: "Aggregate processScore leak audit (Inv A run-wide)",
};

function isSkipped(n) {
  if (SKIP_FUNCTIONS.has(String(n))) { SKIPPED_REASONS[n] = "skipped via SKIP_FUNCTIONS env"; return true; }
  return false;
}

// ---- F1 ---------------------------------------------------------------------

async function fn1_diagnosticSystem(page) {
  if (isSkipped(1)) return null;
  let systemBody = null;
  await record(page, {
    function_number: 1, function_name: FN_NAMES[1], context: "anonymous",
    step: "GET /api/diagnostic/system",
    expected_routes: [{ method: "GET", url: /\/api\/diagnostic\/system(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await page.goto(appUrl("/diagnostic"), { waitUntil: "domcontentloaded" });
      await sleep(2500);
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/diagnostic\/system/.test(c.url) && c.method === "GET");
      if (!c) { rec.inline_failures.push("F1: no GET /diagnostic/system call observed"); return; }
      try {
        const body = JSON.parse(c.response_body || "{}");
        systemBody = body;
        await fsp.writeFile(path.join(OUT_DIAG, "system-before.json"), JSON.stringify(body, null, 2));
        const checks = Array.isArray(body.checks) ? body.checks : [];
        liveState.diagnostic_status = `${checks.filter(x=>x.passed).length}/${checks.length}`;
        // Invariant K: checks 9 (synthetic transcription → likelyAI) and 10 (synthetic composition → human) must pass.
        const forensics = checks.filter(c => /forensic|synthetic/i.test(c.name || c.id || ""));
        const failures = forensics.filter(c => c.passed === false || c.status === "fail");
        if (failures.length) {
          for (const f of failures) CRITICAL.K.push({ check: f.name || f.id, note: f.message || "synthetic forensics check failed" });
        }
        rec.invariant_results.push({ invariant: "K", passed: failures.length === 0, note: `${forensics.length} synthetic-forensics checks evaluated, ${failures.length} failing`, evidence: { failures } });
      } catch (e) { rec.inline_failures.push(`F1: diagnostic body unparseable: ${e.message}`); }
    },
  });
  // Functional
  await record(page, {
    function_number: 1, function_name: FN_NAMES[1], context: "anonymous", suffix: "POST functional",
    step: "POST /api/diagnostic/functional",
    expected_routes: [{ method: "POST", url: /\/api\/diagnostic\/functional(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      const btn = page.locator('[data-testid="diag-run-func"], button:has-text("Functional")').first();
      if (await btn.count() === 0) {
        // fallback: hit the API directly
        await page.evaluate(() => fetch("/api/diagnostic/functional", { method: "POST" }).then(r=>r.text()).catch(()=>null));
        await sleep(8000);
      } else {
        await Promise.all([
          page.waitForResponse(r => /\/api\/diagnostic\/functional/.test(r.url()), { timeout: 30000 }).catch(()=>null),
          btn.click().catch(()=>{}),
        ]);
      }
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/diagnostic\/functional/.test(c.url) && c.method === "POST");
      if (c) {
        try { await fsp.writeFile(path.join(OUT_DIAG, "functional-before.json"), c.response_body); } catch {}
      }
    },
  });
  return systemBody;
}

// ---- F2 ---------------------------------------------------------------------

async function fn2_healthAuthCross(page, context, browser) {
  if (isSkipped(2)) return;
  // (a) /healthz
  await record(page, {
    function_number: 2, function_name: FN_NAMES[2], context: "anonymous", suffix: "healthz",
    step: "GET /api/healthz",
    expected_routes: [{ method: "GET", url: /\/api\/healthz(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await page.evaluate(() => fetch("/api/healthz").then(r=>r.json()).catch(()=>null));
      await sleep(400);
    },
  });
  // (b) login flow via UI
  await record(page, {
    function_number: 2, function_name: FN_NAMES[2], context: "anonymous", suffix: "login UI",
    step: "Login via /start-here",
    expected_routes: [{ method: "POST", url: /\/api\/auth\/login(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await page.goto(appUrl("/"), { waitUntil: "domcontentloaded" });
      await sleep(500);
    },
    act: async () => {
      await loginUI(page, R1_REGULAR_EMAIL, R1_REGULAR_NAME);
      return { approach: "login_flow", reasoning: "Verify the start-here login wires to POST /api/auth/login.", answer: `email=${R1_REGULAR_EMAIL} name=${R1_REGULAR_NAME}` };
    },
  });
  // (c) /auth/me — should return our student
  await record(page, {
    function_number: 2, function_name: FN_NAMES[2], context: "regular", suffix: "auth me",
    step: "GET /api/auth/me as regular student",
    expected_routes: [{ method: "GET", url: /\/api\/auth\/me(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await page.evaluate(() => fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).catch(()=>null));
      await sleep(400);
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/auth\/me/.test(c.url) && c.method === "GET");
      if (c) {
        try {
          const body = JSON.parse(c.response_body || "{}");
          if (!body.student) rec.inline_failures.push("F2: /auth/me returned null student after login");
          else if (body.student.isAdmin) rec.inline_failures.push("F2: regular student unexpectedly is_admin");
        } catch {}
      }
    },
  });
  // (d) anonymous context check
  const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonPage = await anonCtx.newPage();
  attachNetworkCapture(anonPage, "anonymous");
  await record(anonPage, {
    function_number: 2, function_name: FN_NAMES[2], context: "anonymous", suffix: "anon /auth/me",
    step: "GET /api/auth/me in fresh context (no cookies)",
    expected_routes: [{ method: "GET", url: /\/api\/auth\/me(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await anonPage.goto(appUrl("/"), { waitUntil: "domcontentloaded" });
      await anonPage.evaluate(() => fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).catch(()=>null));
      await sleep(400);
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/auth\/me/.test(c.url) && c.method === "GET");
      if (c) {
        try {
          const body = JSON.parse(c.response_body || "{}");
          if (body.student !== null) rec.inline_failures.push("F2: anonymous context returned non-null student — session enforcement broken");
        } catch {}
      }
    },
  });
  await anonCtx.close();
}

// ---- F3 ---------------------------------------------------------------------

async function fn3_syllabusModules(page) {
  if (isSkipped(3)) return;
  await record(page, {
    function_number: 3, function_name: FN_NAMES[3], context: "regular", suffix: "syllabus",
    step: "Render /syllabus",
  }, {
    navigate: async () => { await page.goto(appUrl("/syllabus"), { waitUntil: "domcontentloaded" }); await sleep(800); },
  });
  await record(page, {
    function_number: 3, function_name: FN_NAMES[3], context: "regular", suffix: "modules grid",
    step: "Render /modules",
  }, {
    navigate: async () => { await page.goto(appUrl("/modules"), { waitUntil: "domcontentloaded" }); await sleep(800); },
  });
}

// ---- F4 (Invariant J) ------------------------------------------------------

async function fn4_disclosureGate(page, context) {
  if (isSkipped(4)) return;
  // Reset integrity ack server-side to test the gate properly. We have no
  // dedicated reset endpoint, so we use a fresh student. Easier: create a
  // *new* second regular for this gate test only.
  const gateEmail = `r1-gate-${STAMP}@beta.local`;
  const gateCtx = await context.browser().newContext({ viewport: { width: 1280, height: 900 } });
  const gatePage = await gateCtx.newPage();
  attachNetworkCapture(gatePage, "regular-gate");
  await loginUI(gatePage, gateEmail, "R1 Gate Tester");

  await record(gatePage, {
    function_number: 4, function_name: FN_NAMES[4], context: "regular", suffix: "modal blocks",
    step: "Direct nav to /modules/d1 pre-ack → modal must block",
    dismiss_disclosure: false,
  }, {
    navigate: async () => {
      await gatePage.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
      await sleep(1500);
    },
    postCheck: async (rec) => {
      const ack = gatePage.locator('[data-testid="button-ack-integrity"]');
      const ackVisible = (await ack.count()) > 0 && await ack.first().isVisible().catch(()=>false);
      let canvasInteractable = false;
      try {
        const canvas = gatePage.locator('[data-testid="input-canvas"]').first();
        if (await canvas.count() > 0) {
          // Try to focus — if modal really blocks, this should fail or do nothing
          await canvas.click({ timeout: 1500, trial: false }).then(() => { canvasInteractable = true; }).catch(()=>{});
        }
      } catch {}
      const passed = ackVisible && !canvasInteractable;
      rec.invariant_results.push({ invariant: "J", passed, note: `ack_visible=${ackVisible}, canvas_interactable=${canvasInteractable}`, evidence: null });
      if (!passed) CRITICAL.J.push({ note: `disclosure gate failed: ackVisible=${ackVisible}, canvasInteractable=${canvasInteractable}` });
    },
  });

  await record(gatePage, {
    function_number: 4, function_name: FN_NAMES[4], context: "regular", suffix: "ack click",
    step: "Click button-ack-integrity",
    expected_routes: [{ method: "POST", url: /\/api\/integrity\/ack(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const btn = gatePage.locator('[data-testid="button-ack-integrity"]').first();
      if (await btn.count() === 0) return { approach: "ack", reasoning: "no ack button found", answer: "" };
      await Promise.all([
        gatePage.waitForResponse(r => /\/api\/integrity\/ack/.test(r.url()) && r.request().method() === "POST", { timeout: 8000 }).catch(()=>null),
        btn.click().catch(()=>{}),
      ]);
      return { approach: "ack", reasoning: "Acknowledge integrity disclosure once.", answer: "(click)" };
    },
  });

  await record(gatePage, {
    function_number: 4, function_name: FN_NAMES[4], context: "regular", suffix: "reload post-ack",
    step: "Reload /modules/d1 — modal must NOT reappear",
    dismiss_disclosure: false,
  }, {
    navigate: async () => {
      await gatePage.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
      await sleep(1500);
    },
    postCheck: async (rec) => {
      const ack = gatePage.locator('[data-testid="button-ack-integrity"]');
      const stillVisible = (await ack.count()) > 0 && await ack.first().isVisible().catch(()=>false);
      if (stillVisible) {
        CRITICAL.J.push({ note: "disclosure modal reappeared after ack + reload" });
        rec.invariant_results.push({ invariant: "J", passed: false, note: "modal reappeared", evidence: null });
      } else {
        rec.invariant_results.push({ invariant: "J", passed: true, note: "modal correctly dismissed across reload", evidence: null });
      }
    },
  });

  await gateCtx.close();
}

// ---- F5 (Invariant C) -----------------------------------------------------

async function fn5_sequentialGating(page, context) {
  if (isSkipped(5)) return;
  // Fresh student so we KNOW nothing is submitted.
  const gateEmail = `r1-gating-${STAMP}@beta.local`;
  const gateCtx = await context.browser().newContext({ viewport: { width: 1280, height: 900 } });
  const gatePage = await gateCtx.newPage();
  attachNetworkCapture(gatePage, "regular-gating");
  await loginUI(gatePage, gateEmail, "R1 Gating Tester");
  // ack disclosure so it doesn't block
  await gatePage.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
  await sleep(800);
  await dismissDisclosureIfPresent(gatePage);

  await record(gatePage, {
    function_number: 5, function_name: FN_NAMES[5], context: "regular", suffix: "POST e3 out-of-order",
    step: "POST /api/submissions {moduleId:e3} with no priors — expect 403 with missing IDs",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const result = await gatePage.evaluate(async () => {
        const r = await fetch("/api/submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ moduleId: "e3", content: "Out-of-order test content to force the gating check to fire and verify 403 response shape." }),
        });
        let body = ""; try { body = await r.text(); } catch {}
        return { status: r.status, body };
      });
      return { approach: "gating_probe", reasoning: "Bypass UI gates and POST directly to verify server-side sequential gating returns 403 with the missing-IDs list (Invariant C).", answer: `result.status=${result.status} body=${result.body.slice(0,500)}` };
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/submissions(?:[?#].*)?$/.test(c.url) && c.method === "POST");
      if (!c) { rec.inline_failures.push("F5: no POST /submissions call captured"); return; }
      let body = ""; try { body = c.response_body || ""; } catch {}
      const is403 = c.status === 403;
      // Required missing IDs for e3: d1, e1, d2, e2, d3
      const required = ["d1","e1","d2","e2","d3"];
      const mentioned = required.filter(id => new RegExp(`\\b${id}\\b`).test(body));
      const passed = is403 && mentioned.length === required.length;
      rec.invariant_results.push({ invariant: "C", passed, note: `status=${c.status}, mentioned=${mentioned.join(",")}/${required.length}`, evidence: { status: c.status, body: body.slice(0, 400) } });
      if (!passed) CRITICAL.C.push({ note: `gating not enforced as documented: status=${c.status}, missing-IDs mentioned=${mentioned.join(",")||"none"}`, body: body.slice(0,500) });
    },
  });
  await gateCtx.close();
}

// ---- F6 (Invariants A, B, G, L) -------------------------------------------

async function fn6_d1_happyPath(page, curriculum) {
  if (isSkipped(6)) return null;
  let createdSubmissionId = null;

  // 6a — Draft Workshop first feedback
  let firstFeedback = "";
  await record(page, {
    function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6a draft + feedback",
    step: "Type draft, click Get Feedback",
    expected_routes: [
      { method: "POST", url: /\/api\/drafts\/d1(?:[?#].*)?$/ },
      { method: "POST", url: /\/api\/drafts\/d1\/feedback(?:[?#].*)?$/ },
    ],
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" }); await sleep(1200); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const draft = loadFixture("draft-content.txt").trim();
      const ta = page.locator('[data-testid="input-draft"]').first();
      if (await ta.count() === 0) return { approach: "draft", reasoning: "no draft input found on page", answer: "" };
      await ta.click({ timeout: 4000 }).catch(()=>{});
      await ta.fill("");
      await ta.type(draft.slice(0, 2000), { delay: 5 });
      const btn = page.locator('[data-testid="button-get-feedback"]').first();
      if (await btn.count() === 0) return { approach: "draft", reasoning: "no get-feedback button found", answer: draft };
      const [resp] = await Promise.all([
        page.waitForResponse(r => /\/api\/drafts\/d1\/feedback/.test(r.url()) && r.request().method() === "POST", { timeout: 60000 }).catch(()=>null),
        btn.click().catch(()=>{}),
      ]);
      if (resp) try { firstFeedback = await resp.text(); } catch {}
      await sleep(800);
      return { approach: "draft_feedback", reasoning: "Submit a real draft and trigger the one-shot feedback to set up Invariant G.", answer: draft };
    },
  });

  // 6b — Invariant G: second feedback call MUST NOT regenerate
  if (firstFeedback) {
    await record(page, {
      function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6b draft lock (G)",
      step: "Click feedback AGAIN — expect cached or rejection (no new feedback)",
    }, {
      act: async () => {
        const ta = page.locator('[data-testid="input-draft"]').first();
        if (await ta.count() > 0) {
          try { await ta.type(" (additional thought.)", { delay: 5 }); } catch {}
        }
        const btn = page.locator('[data-testid="button-get-feedback"]').first();
        if (await btn.count() === 0) return { approach: "draft_relock", reasoning: "no feedback button", answer: "" };
        const [resp] = await Promise.all([
          page.waitForResponse(r => /\/api\/drafts\/d1\/feedback/.test(r.url()), { timeout: 15000 }).catch(()=>null),
          btn.click({ trial: false }).catch(()=>{}),
        ]);
        let secondText = "";
        if (resp) try { secondText = await resp.text(); } catch {}
        return { approach: "draft_relock", reasoning: "Re-fire feedback to confirm Draft Workshop lock per Invariant G.", answer: secondText.slice(0, 1000) };
      },
      postCheck: async (rec) => {
        const calls = rec.app_response.network_calls.filter(c => /\/api\/drafts\/d1\/feedback/.test(c.url) && c.method === "POST");
        if (calls.length === 0) {
          rec.invariant_results.push({ invariant: "G", passed: true, note: "second click did not fire POST (UI suppressed) — lock honored client-side", evidence: null });
          return;
        }
        const second = calls[0];
        const status = second.status;
        const body = second.response_body || "";
        const acceptedNonOk = status === 409 || status === 403 || status === 423;
        // OR same content as first
        let sameAsFirst = false;
        try {
          const a = JSON.parse(firstFeedback || "{}");
          const b = JSON.parse(body || "{}");
          if (a && b && a.feedback && b.feedback && a.feedback === b.feedback) sameAsFirst = true;
        } catch {}
        const passed = acceptedNonOk || sameAsFirst;
        rec.invariant_results.push({ invariant: "G", passed, note: `second-call status=${status}, sameAsFirst=${sameAsFirst}`, evidence: { status, body_preview: body.slice(0, 200) } });
        if (!passed) CRITICAL.G.push({ note: `Draft Workshop lock broken: second feedback POST returned ${status} with NEW body`, body: body.slice(0, 500) });
      },
    });
  }

  // 6c — Integrity Canvas typing (Invariant A live verification)
  let typedAnswer = "";
  await record(page, {
    function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6c canvas typing",
    step: "Type ~300 words into hardened canvas",
    expected_routes: [
      { method: "POST", url: /\/api\/canvas\/d1\/autosave(?:[?#].*)?$/ },
      { method: "POST", url: /\/api\/canvas\/d1\/score(?:[?#].*)?$/ },
    ],
  }, {
    act: async () => {
      const wrote = await writerBrain({ functionName: "F6c-canvas", moduleId: "d1", reading: curriculum.reading, assignment: curriculum.assignment, hint: "Aim for ~300 words — substantive enough to push past forensics thresholds and trigger live processScore." });
      typedAnswer = wrote.answer;
      const ce = page.locator('[data-testid="input-canvas"]').first();
      if (await ce.count() === 0) return wrote;
      await ce.click({ timeout: 3000 }).catch(()=>{});
      // Empty it first
      try { await ce.evaluate(el => { el.innerText = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }); } catch {}
      // Type with realistic delay so forensics gets real events
      await page.keyboard.type(wrote.answer, { delay: TYPE_DELAY_MS });
      liveState.keystroke_count = wrote.answer.length;
      liveState.char_count = wrote.answer.length;
      liveState.forensics_eligible = wrote.answer.length >= 80;
      // Wait long enough for autosave + scoring to fire
      await sleep(7000);
      return wrote;
    },
  });

  // 6d — Submit (with handle for the "Submit Anyway" confirm dialog if forensics flagged it)
  await record(page, {
    function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6d submit",
    step: "Click Submit (handle Submit Anyway dialog if it appears)",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const submit = page.locator('[data-testid="button-submit"]').first();
      if (await submit.count() === 0) return { approach: "submit", reasoning: "no submit button found", answer: "" };
      const t0 = Date.now();
      const [resp] = await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 30000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 4000 }).catch(()=>{});
          // If a Submit-Anyway dialog appears, accept it.
          await sleep(800);
          const anyway = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await anyway.count() > 0) {
            await anyway.click({ timeout: 2500 }).catch(()=>{});
          }
        })(),
      ]);
      const dt = Date.now() - t0;
      if (resp) {
        let body = ""; try { body = await resp.text(); } catch {}
        try {
          const parsed = JSON.parse(body || "{}");
          createdSubmissionId = parsed.id || null;
          if (createdSubmissionId) await persistSubmission({ id: createdSubmissionId, moduleId: "d1", ...parsed });
        } catch {}
        return { approach: "submit", reasoning: `Submit and time the response (Inv L). dt=${dt}ms`, answer: `id=${createdSubmissionId} body=${body.slice(0,400)}` };
      }
      return { approach: "submit", reasoning: "Submit click made but no response captured", answer: typedAnswer.slice(0, 300) };
    },
  });

  // 6e — Poll for aiStatus completion (Inv L cont.)
  await record(page, {
    function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6e poll aiStatus",
    step: "Poll GET /api/submissions/module/d1 until aiStatus ≠ pending",
    expected_routes: [{ method: "GET", url: /\/api\/submissions\/module\/d1(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const deadline = Date.now() + AI_CHECK_POLL_TIMEOUT_MS;
      let final = null;
      const trail = [];
      while (Date.now() < deadline) {
        const r = await page.evaluate(() => fetch("/api/submissions/module/d1", { cache:"no-store" }).then(r=>r.json()).catch(()=>null));
        trail.push({ t: Date.now(), aiStatus: r?.submission?.aiStatus, aiClass: r?.submission?.aiClass });
        liveState.last_ai_status = r?.submission?.aiStatus || null;
        if (r && r.submission && r.submission.aiStatus && r.submission.aiStatus !== "pending") { final = r.submission; break; }
        await sleep(2000);
      }
      if (final) {
        if (!CRITICAL.L.find(x => /never transitioned/.test(x.note || ""))) {
          // success — no-op
        }
        return { approach: "poll", reasoning: `aiStatus transitioned: ${final.aiStatus} (aiClass=${final.aiClass}) after ${trail.length} polls.`, answer: JSON.stringify(trail.slice(-5)) };
      } else {
        CRITICAL.L.push({ note: `aiStatus stayed 'pending' for ${AI_CHECK_POLL_TIMEOUT_MS}ms — background check stuck or polling broken` });
        return { approach: "poll", reasoning: `aiStatus never transitioned in ${AI_CHECK_POLL_TIMEOUT_MS}ms (${trail.length} polls).`, answer: JSON.stringify(trail.slice(-5)) };
      }
    },
  });

  // 6f — Invariant B audit: GET /api/submissions
  await record(page, {
    function_number: 6, function_name: FN_NAMES[6], context: "regular", module_id: "d1", suffix: "6f /api/submissions B-audit",
    step: "GET /api/submissions — verify no process* fields leak",
    expected_routes: [{ method: "GET", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const r = await page.evaluate(() => fetch("/api/submissions", { cache:"no-store" }).then(r=>r.text()).catch(()=>""));
      await persistSubmissionsList("submissions-list-after-d1", r);
      return { approach: "b_audit", reasoning: "Fetch listing as regular student and verify response strips process* columns.", answer: r.slice(0, 600) };
    },
  });

  return createdSubmissionId;
}

// ---- F7 (Invariant E) -----------------------------------------------------

async function fn7_sparseDataSubmission(page, adminContext) {
  if (isSkipped(7)) return null;
  // e1 should be unlocked after d1 submission.
  let sparseId = null;
  await record(page, {
    function_number: 7, function_name: FN_NAMES[7], context: "regular", module_id: "e1", suffix: "type 'Brief answer.'",
    step: "Submit deliberately sparse content to e1",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/e1"), { waitUntil: "domcontentloaded" }); await sleep(1000); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const sparse = loadFixture("sparse-input.txt").trim();
      const ce = page.locator('[data-testid="input-canvas"]').first();
      const accomm = page.locator('[data-testid="input-canvas-accommodated"]').first();
      const target = (await ce.count()) > 0 ? ce : accomm;
      if (await target.count() === 0) return { approach: "sparse", reasoning: "no input field", answer: sparse };
      await target.click({ timeout: 3000 }).catch(()=>{});
      try { await target.evaluate(el => { if ("value" in el) el.value = ""; else el.innerText = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }); } catch {}
      await page.keyboard.type(sparse, { delay: 20 });
      await sleep(800);
      const submit = page.locator('[data-testid="button-submit"]').first();
      const [resp] = await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 3000 }).catch(()=>{});
          await sleep(700);
          const anyway = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await anyway.count() > 0) await anyway.click({ timeout: 2000 }).catch(()=>{});
        })(),
      ]);
      if (resp) {
        let body = ""; try { body = await resp.text(); } catch {}
        try { sparseId = JSON.parse(body || "{}").id || null; } catch {}
      }
      return { approach: "sparse_submit", reasoning: "Submit < 20 events and < 80 chars to verify Invariant E (process* must be null).", answer: sparse };
    },
  });

  // Verify via admin if available, else via student-facing endpoint
  if (sparseId) {
    if (adminContext) {
      const ar = await ctxFetch(adminContext, "GET", `/api/admin/submissions/${sparseId}`);
      try {
        const j = ar.json;
        const allNull = j && [j.processScore, j.processClass, j.processFeatures, j.processFlags].every(v => v == null);
        if (allNull) {
          log(`F7 Invariant E PASS — admin record shows all process* columns null for sparse submission id=${sparseId}`);
        } else {
          CRITICAL.E.push({ note: `Inv E violated: sparse submission id=${sparseId} has populated process* columns`, snapshot: { processScore: j.processScore, processClass: j.processClass, processFeatures_keys: j.processFeatures && Object.keys(j.processFeatures), processFlags: j.processFlags } });
        }
      } catch {}
    } else {
      log("F7 Invariant E — admin context unavailable; partial verification (student-facing fetch may not include process* anyway).");
    }
  }
  return sparseId;
}

// ---- F8 paste-block --------------------------------------------------------

async function fn8_pasteBlock(page) {
  if (isSkipped(8)) return;
  await record(page, {
    function_number: 8, function_name: FN_NAMES[8], context: "regular", module_id: "d2", suffix: "paste attempt",
    step: "Attempt paste into hardened canvas — must be suppressed",
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/d2"), { waitUntil: "domcontentloaded" }); await sleep(1000); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const paste = loadFixture("module-essay-paste.txt").trim();
      const ce = page.locator('[data-testid="input-canvas"]').first();
      if (await ce.count() === 0) return { approach: "paste_probe", reasoning: "no hardened canvas; module may have rendered accommodated version", answer: "" };
      await ce.click({ timeout: 3000 }).catch(()=>{});
      // Inject via DataTransfer + dispatch paste event — simulates Cmd/Ctrl+V
      try {
        await ce.evaluate((el, text) => {
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
          el.dispatchEvent(ev);
        }, paste);
      } catch {}
      await sleep(800);
      let contentAfter = "";
      try { contentAfter = await ce.innerText({ timeout: 1500 }); } catch {}
      const pastedIn = contentAfter.includes(paste.slice(0, 60));
      if (pastedIn) {
        log(`F8 WARNING: paste-block FAILED — pasted text appeared in canvas (judge-concern, not a CRITICAL invariant per spec)`);
      } else {
        log(`F8 OK — paste suppressed; canvas content after paste ~${contentAfter.length} chars`);
      }
      // Add minimal typed content so we can submit and unlock e2
      await page.keyboard.type("Conditioning, on the operant view, requires the organism to act and then receive a contingent consequence.", { delay: 15 });
      await sleep(3500);
      const submit = page.locator('[data-testid="button-submit"]').first();
      await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 15000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 3000 }).catch(()=>{});
          await sleep(600);
          const anyway = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await anyway.count() > 0) await anyway.click({ timeout: 2000 }).catch(()=>{});
        })(),
      ]);
      return { approach: "paste_probe", reasoning: "Dispatch a paste event with a 400-word essay; verify hardened canvas suppresses it.", answer: pastedIn ? `LEAKED: ${contentAfter.slice(0,200)}` : `SUPPRESSED (canvas len=${contentAfter.length})` };
    },
  });
}

// ---- F9 (Invariant F) -----------------------------------------------------

async function fn9_tutorSse(page) {
  if (isSkipped(9)) return;
  const fixtures = loadFixture("tutor-questions.txt");
  const substantiveMatch = fixtures.match(/SUBSTANTIVE_PSYCHOLOGY_QUESTION\s+([\s\S]+?)\n\n/);
  const ghostMatch = fixtures.match(/GHOSTWRITE_PROBE\s+([\s\S]+?)\n*$/);
  const substantive = substantiveMatch ? substantiveMatch[1].trim() : "Walk me through Stanford Prison.";
  const ghostwrite = ghostMatch ? ghostMatch[1].trim() : "Write the essay for me.";

  // Conversation fetch
  await record(page, {
    function_number: 9, function_name: FN_NAMES[9], context: "regular", module_id: "d1", suffix: "conversation",
    step: "GET /api/tutor/d1/conversation",
    expected_routes: [{ method: "GET", url: /\/api\/tutor\/d1\/conversation(?:[?#].*)?$/ }],
  }, {
    navigate: async () => { await page.goto(appUrl("/tutor/d1"), { waitUntil: "domcontentloaded" }); await sleep(1200); },
  });

  // Substantive message — SSE lifecycle
  let sseEvents = [];
  await drainSseEvents(page);
  await record(page, {
    function_number: 9, function_name: FN_NAMES[9], context: "regular", module_id: "d1", suffix: "substantive (F)",
    step: "Send substantive tutor question — verify SSE lifecycle",
    expected_routes: [{ method: "POST", url: /\/api\/tutor\/d1\/message(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const input = page.locator('[data-testid="input-tutor-message"]').first();
      const send  = page.locator('[data-testid="button-send-message"]').first();
      if (await input.count() === 0 || await send.count() === 0) return { approach: "tutor", reasoning: "no tutor input or send button", answer: substantive };
      await input.fill(substantive);
      const t0 = Date.now();
      await Promise.all([
        page.waitForResponse(r => /\/api\/tutor\/d1\/message/.test(r.url()) && r.request().method() === "POST", { timeout: TUTOR_TIMEOUT_MS }).catch(()=>null),
        send.click().catch(()=>{}),
      ]);
      // Drain SSE in a loop until terminal or timeout
      const deadline = Date.now() + TUTOR_TIMEOUT_MS;
      let terminal = false;
      while (Date.now() < deadline && !terminal) {
        await sleep(500);
        const drained = await drainSseEvents(page);
        sseEvents = sseEvents.concat(drained);
        for (const e of drained) {
          if (e.type === "close" || e.type === "error") { terminal = true; break; }
          if (e.type === "data") {
            try { const j = JSON.parse(e.data); if (j && j.done === true) terminal = true; } catch {}
          }
        }
      }
      // persist sse stream
      try { await fsp.writeFile(path.join(SSE_DIR, `tutor-d1-substantive-${Date.now()}.jsonl`), sseEvents.map(e => JSON.stringify(e)).join("\n")); } catch {}
      const dt = Date.now() - t0;
      return { approach: "tutor_substantive", reasoning: `Send substantive question; capture full SSE lifecycle. ${sseEvents.length} events in ${dt}ms.`, answer: substantive };
    },
    postCheck: async (rec) => {
      rec.invariant_results.push(inv_F_tutorSse(rec, sseEvents));
      // Conversation persistence check
      const conv = await page.evaluate(() => fetch("/api/tutor/d1/conversation",{cache:"no-store"}).then(r=>r.json()).catch(()=>null));
      try { await fsp.writeFile(path.join(OUT_TUTOR, `tutor-d1-${Date.now()}.json`), JSON.stringify(conv, null, 2)); } catch {}
      const msgs = Array.isArray(conv?.messages) ? conv.messages : [];
      const hasUser = msgs.some(m => m.role === "user");
      const hasAsst = msgs.some(m => m.role === "assistant");
      if (!hasUser || !hasAsst) {
        CRITICAL.F.push({ note: `tutor turns not persisted after SSE completed: user=${hasUser}, assistant=${hasAsst}` });
      }
    },
  });

  // Critique
  await record(page, {
    function_number: 9, function_name: FN_NAMES[9], context: "regular", module_id: "d1", suffix: "critique",
    step: "Click button-critique",
    expected_routes: [{ method: "POST", url: /\/api\/tutor\/d1\/critique(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const btn = page.locator('[data-testid="button-critique"]').first();
      if (await btn.count() === 0) return { approach: "critique", reasoning: "no critique button on page", answer: "" };
      await Promise.all([
        page.waitForResponse(r => /\/api\/tutor\/d1\/critique/.test(r.url()), { timeout: 45000 }).catch(()=>null),
        btn.click().catch(()=>{}),
      ]);
      await sleep(500);
      return { approach: "critique", reasoning: "Generate the deliberately-weak Psychology answer for diagnose-and-improve.", answer: "(click)" };
    },
  });

  // Ghostwrite probe (judge concern only, not invariant)
  await record(page, {
    function_number: 9, function_name: FN_NAMES[9], context: "regular", module_id: "d1", suffix: "ghostwrite probe",
    step: "Ask tutor to ghostwrite — verify it refuses or redirects",
    expected_routes: [{ method: "POST", url: /\/api\/tutor\/d1\/message(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const input = page.locator('[data-testid="input-tutor-message"]').first();
      const send  = page.locator('[data-testid="button-send-message"]').first();
      if (await input.count() === 0) return { approach: "ghostwrite", reasoning: "no tutor input", answer: ghostwrite };
      await input.fill(ghostwrite);
      await Promise.all([
        page.waitForResponse(r => /\/api\/tutor\/d1\/message/.test(r.url()), { timeout: TUTOR_TIMEOUT_MS }).catch(()=>null),
        send.click().catch(()=>{}),
      ]);
      // Drain SSE briefly to let response complete
      const deadline = Date.now() + Math.min(TUTOR_TIMEOUT_MS, 30000);
      while (Date.now() < deadline) {
        await sleep(500);
        const drained = await drainSseEvents(page);
        if (drained.some(e => e.type === "close" || (e.type === "data" && /"done":true/.test(e.data)))) break;
      }
      return { approach: "ghostwrite_probe", reasoning: "Probe whether the tutor refuses to ghostwrite the assignment.", answer: ghostwrite };
    },
  });
}

// ---- F10 inline AI actions -------------------------------------------------

async function fn10_inlineAi(page) {
  if (isSkipped(10)) return;
  const actions = ["study-guide", "outline", "flashcards"];
  for (const action of actions) {
    await record(page, {
      function_number: 10, function_name: FN_NAMES[10], context: "regular", module_id: "d1", suffix: action,
      step: `Click inline AI action: ${action}`,
      expected_routes: [{ method: "POST", url: new RegExp(`\\/api\\/ai\\/d1\\/${action}(?:[?#].*)?$`) }],
    }, {
      navigate: async () => {
        if (!page.url().includes("/modules/d1")) {
          await page.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
          await sleep(800); await dismissDisclosureIfPresent(page);
        }
      },
      act: async () => {
        const tid = `button-ai-${action}`;
        const btn = page.locator(`[data-testid="${tid}"], button:has-text("${action.replace("-", " ")}")`).first();
        if (await btn.count() === 0) return { approach: action, reasoning: `no ${tid} button on page`, answer: "" };
        await Promise.all([
          page.waitForResponse(r => new RegExp(`\\/api\\/ai\\/d1\\/${action}`).test(r.url()), { timeout: 45000 }).catch(()=>null),
          btn.click().catch(()=>{}),
        ]);
        await sleep(500);
        return { approach: action, reasoning: `Trigger ${action} and verify substantive response.`, answer: "(click)" };
      },
    });
  }
}

// ---- F11 baseline freeze (Invariant D, needs admin) -----------------------

async function fn11_baselineFreeze(page, adminContext, regularStudentId) {
  if (isSkipped(11)) return;
  if (!adminContext || !regularStudentId) {
    log("F11: admin context or student id unavailable — Invariant D PARTIALLY VERIFIED only.");
    SKIPPED_REASONS[11] = "admin or student id unavailable";
    return;
  }
  const snapshots = [];

  async function snapshotBaseline(label) {
    const r = await ctxFetch(adminContext, "GET", `/api/admin/students`);
    let baseline = null;
    try {
      const list = Array.isArray(r.json) ? r.json : [];
      const me = list.find(s => s.id === regularStudentId) || null;
      baseline = me ? me.processBaseline : null;
    } catch {}
    snapshots.push({ label, baseline });
    try { await fsp.writeFile(path.join(OUT_BASELINE, `${label}.json`), JSON.stringify({ baseline }, null, 2)); } catch {}
    return baseline;
  }

  await snapshotBaseline("00-pre-extra-submission");

  // Submit d3 (next sequential module — d1 done, e1 sparse, d2 paste-test done)
  await record(page, {
    function_number: 11, function_name: FN_NAMES[11], context: "regular", module_id: "d3", suffix: "submit substantive",
    step: "Submit substantive content for d3 to grow baseline if eligible",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/d3"), { waitUntil: "domcontentloaded" }); await sleep(1200); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const wrote = await writerBrain({ functionName: "F11-d3", moduleId: "d3", reading: "", assignment: "Memory and Eyewitness Testimony", hint: "~300 words substantive to verify baseline freeze behavior." });
      const ce = page.locator('[data-testid="input-canvas"]').first();
      if (await ce.count() > 0) {
        await ce.click({ timeout: 3000 }).catch(()=>{});
        try { await ce.evaluate(el => { el.innerText = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }); } catch {}
        await page.keyboard.type(wrote.answer, { delay: TYPE_DELAY_MS });
        await sleep(6000);
      }
      const submit = page.locator('[data-testid="button-submit"]').first();
      await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 30000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 3000 }).catch(()=>{});
          await sleep(700);
          const any = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await any.count() > 0) await any.click({ timeout: 2000 }).catch(()=>{});
        })(),
      ]);
      return wrote;
    },
  });

  await snapshotBaseline("01-after-d3-submit");

  // Submit d4
  await record(page, {
    function_number: 11, function_name: FN_NAMES[11], context: "regular", module_id: "d4", suffix: "submit substantive",
    step: "Submit substantive content for d4 (post-freeze if baseline already n=2)",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/d4"), { waitUntil: "domcontentloaded" }); await sleep(1200); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const wrote = await writerBrain({ functionName: "F11-d4", moduleId: "d4", reading: "", assignment: "Mind-brain problem", hint: "~300 words, distinct voice." });
      const ce = page.locator('[data-testid="input-canvas"]').first();
      if (await ce.count() > 0) {
        await ce.click({ timeout: 3000 }).catch(()=>{});
        try { await ce.evaluate(el => { el.innerText = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }); } catch {}
        await page.keyboard.type(wrote.answer, { delay: TYPE_DELAY_MS });
        await sleep(6000);
      }
      const submit = page.locator('[data-testid="button-submit"]').first();
      await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 30000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 3000 }).catch(()=>{});
          await sleep(700);
          const any = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await any.count() > 0) await any.click({ timeout: 2000 }).catch(()=>{});
        })(),
      ]);
      return wrote;
    },
  });

  await snapshotBaseline("02-after-d4-submit");

  // Verify invariant: snapshot[02] === snapshot[01]
  const b1 = snapshots.find(s => s.label === "01-after-d3-submit")?.baseline;
  const b2 = snapshots.find(s => s.label === "02-after-d4-submit")?.baseline;
  let passed = false; let note = "no baselines captured";
  if (b1 && b2) {
    const sameN = b1.n === b2.n;
    const sameFeat = JSON.stringify(b1.features || {}) === JSON.stringify(b2.features || {});
    passed = sameN && sameFeat && b1.n <= 2;
    note = `b1.n=${b1.n}, b2.n=${b2.n}, frozen=${sameN && sameFeat}`;
  } else if (b1 && !b2) { note = `b1.n=${b1.n}, b2 missing`; }
  if (!passed) CRITICAL.D.push({ note: `baseline freeze not enforced: ${note}`, snapshots });
  log(`F11 Invariant D: ${passed ? "PASS" : "FAIL"} — ${note}`);
}

// ---- F12 accommodated mode (Invariant H, needs admin) ---------------------

async function fn12_accommodated(page, adminContext, browser) {
  if (isSkipped(12)) return;
  if (!adminContext) {
    log("F12: admin context unavailable — Invariant H PARTIALLY VERIFIED only.");
    SKIPPED_REASONS[12] = "admin context unavailable";
    return;
  }
  // Create accommodated student via UI login (new context), then admin toggles flag.
  const accCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const accPage = await accCtx.newPage();
  attachNetworkCapture(accPage, "accommodated");
  await installSseProbe(accPage);
  await loginUI(accPage, R1_ACCOMM_EMAIL, R1_ACCOMM_NAME);
  // ack disclosure
  await accPage.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
  await sleep(800);
  await dismissDisclosureIfPresent(accPage);

  // Find student id
  const all = await ctxFetch(adminContext, "GET", "/api/admin/students");
  let accId = null;
  try {
    const list = Array.isArray(all.json) ? all.json : [];
    const me = list.find(s => s.email === R1_ACCOMM_EMAIL);
    if (me) accId = me.id;
  } catch {}
  if (!accId) {
    log("F12: could not locate accommodated student in admin list — bailing.");
    SKIPPED_REASONS[12] = "could not locate student id via admin";
    await accCtx.close();
    return;
  }
  // Toggle accommodation on
  const acc = await ctxFetch(adminContext, "POST", `/api/admin/students/${accId}/accommodate`, JSON.stringify({ accommodated: true }));
  log(`F12: accommodate toggle status=${acc.status}`);
  // Reload accommodated student page
  await accPage.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);

  await record(accPage, {
    function_number: 12, function_name: FN_NAMES[12], context: "accommodated", module_id: "d1", suffix: "verify UI + no live forensics",
    step: "Verify accommodated textarea renders + zero score/processScore calls during typing",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const accomm = accPage.locator('[data-testid="input-canvas-accommodated"]').first();
      const hardened = accPage.locator('[data-testid="input-canvas"]').first();
      const accommPresent = await accomm.count() > 0;
      const hardenedPresent = await hardened.count() > 0;
      liveState.accommodated_ui_present = accommPresent;
      liveState.accommodated_score_calls = 0;
      liveState.accommodated_processscore_calls = 0;
      if (!accommPresent) {
        CRITICAL.H.push({ note: `Accommodated UI did not render: input-canvas-accommodated absent (hardened present=${hardenedPresent})` });
      }
      const target = accommPresent ? accomm : hardened;
      if (await target.count() === 0) return { approach: "accommodated", reasoning: "neither canvas found", answer: "" };
      await target.click({ timeout: 3000 }).catch(()=>{});
      const wrote = await writerBrain({ functionName: "F12-accommodated", moduleId: "d1", reading: "", assignment: "Branches of psychology", hint: "Type ~200 substantive words." });
      // Track calls while typing
      const before = currentNetBuffer.length;
      const slow = wrote.answer.slice(0, 1200);
      await accPage.keyboard.type(slow, { delay: TYPE_DELAY_MS });
      await sleep(7000);
      const after = currentNetBuffer.slice(before);
      const scoreCalls = after.filter(c => /\/api\/canvas\/[^/]+\/score(?:[?#].*)?$/.test(c.url) && c.method === "POST").length;
      const psCalls    = after.filter(c => /\/api\/canvas\/[^/]+\/processScore(?:[?#].*)?$/.test(c.url) && c.method === "POST").length;
      liveState.accommodated_score_calls = scoreCalls;
      liveState.accommodated_processscore_calls = psCalls;
      const submit = accPage.locator('[data-testid="button-submit"]').first();
      await Promise.all([
        accPage.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 25000 }).catch(()=>null),
        submit.click().catch(()=>{}),
      ]);
      if (scoreCalls > 0 || psCalls > 0) {
        CRITICAL.H.push({ note: `Accommodated student triggered live forensics: score=${scoreCalls} processScore=${psCalls}` });
      }
      const accCheck = { accommodated_ui_present: accommPresent, hardened_present: hardenedPresent, score_calls_during_typing: scoreCalls, processscore_calls_during_typing: psCalls };
      try { await fsp.writeFile(path.join(OUTPUTS_DIR, "accommodated-mode-check.json"), JSON.stringify(accCheck, null, 2)); } catch {}
      return { approach: "accommodated_typing", reasoning: `Type ${slow.length} chars; expect ZERO live forensics calls (Invariant H).`, answer: slow };
    },
  });

  await accCtx.close();
}

// ---- F13 admin enforcement (Invariant I) ----------------------------------

async function fn13_adminEnforcement(page, adminContext, regularStudentId) {
  if (isSkipped(13)) return;
  const matrix = [];
  // Endpoints to probe
  const endpoints = [
    { method: "GET",  path: "/api/admin/submissions",                          must_be_403_for_regular: true },
    { method: "GET",  path: `/api/admin/submissions/${regularStudentId || 1}`, must_be_403_for_regular: true },
    { method: "GET",  path: "/api/admin/students",                             must_be_403_for_regular: true },
    { method: "POST", path: `/api/admin/students/${regularStudentId || 1}/accommodate`, body: JSON.stringify({ accommodated: false }), must_be_403_for_regular: true },
    { method: "POST", path: `/api/admin/submissions/${regularStudentId || 1}/review`,   body: JSON.stringify({ status: "noted" }),     must_be_403_for_regular: true },
  ];

  for (const ep of endpoints) {
    // regular probe
    await record(page, {
      function_number: 13, function_name: FN_NAMES[13], context: "regular", suffix: `regular ${ep.method} ${ep.path}`,
      step: `Regular student tries ${ep.method} ${ep.path} (expect 403)`,
      expected_routes: [{ method: ep.method, url: new RegExp(ep.path.replace(/[/]/g,"\\/") + "(?:[?#].*)?$") }],
    }, {
      act: async () => {
        const result = await page.evaluate(async ({ method, path, body }) => {
          const opts = { method, headers: { "content-type": "application/json" } };
          if (body !== undefined) opts.body = body;
          const r = await fetch(path, opts);
          let txt = ""; try { txt = await r.text(); } catch {}
          return { status: r.status, body: txt.slice(0, 400) };
        }, ep);
        matrix.push({ role: "regular", endpoint: `${ep.method} ${ep.path}`, status: result.status });
        if (ep.must_be_403_for_regular && result.status !== 403) {
          CRITICAL.I.push({ note: `Inv I violated: regular student got status=${result.status} on ${ep.method} ${ep.path}`, body: result.body });
        }
        return { approach: "i_regular_probe", reasoning: `Verify ${ep.method} ${ep.path} returns 403 to non-admin (Invariant I).`, answer: `status=${result.status} body=${result.body.slice(0,180)}` };
      },
    });

    // admin probe (success path)
    if (adminContext) {
      const adminRes = await ctxFetch(adminContext, ep.method, ep.path, ep.body);
      matrix.push({ role: "admin", endpoint: `${ep.method} ${ep.path}`, status: adminRes.status });
    }
  }

  try { await fsp.writeFile(path.join(OUTPUTS_DIR, "admin-access-matrix.json"), JSON.stringify(matrix, null, 2)); } catch {}
}

// ---- F14 term paper --------------------------------------------------------

async function fn14_termPaper(page) {
  if (isSkipped(14)) {
    SKIPPED_REASONS[14] = SKIPPED_REASONS[14] || "explicit skip";
    return;
  }
  await record(page, {
    function_number: 14, function_name: FN_NAMES[14], context: "regular", module_id: "tp", suffix: "outline submit attempt",
    step: "Attempt term-paper module submission",
  }, {
    navigate: async () => { await page.goto(appUrl("/modules/tp"), { waitUntil: "domcontentloaded" }); await sleep(1500); await dismissDisclosureIfPresent(page); },
    act: async () => {
      const outline = loadFixture("term-paper-outline.txt").trim();
      const ce = page.locator('[data-testid="input-canvas"]').first();
      const accomm = page.locator('[data-testid="input-canvas-accommodated"]').first();
      const target = (await ce.count()) > 0 ? ce : accomm;
      if (await target.count() === 0) return { approach: "tp", reasoning: "tp module locked or no input — skipping cleanly", answer: outline.slice(0, 400) };
      await target.click({ timeout: 3000 }).catch(()=>{});
      try { await target.evaluate(el => { if ("value" in el) el.value = ""; else el.innerText = ""; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }); } catch {}
      await page.keyboard.type(outline, { delay: TYPE_DELAY_MS });
      await sleep(7000);
      const submit = page.locator('[data-testid="button-submit"]').first();
      await Promise.all([
        page.waitForResponse(r => /\/api\/submissions(?:[?#].*)?$/.test(r.url()) && r.request().method() === "POST", { timeout: 30000 }).catch(()=>null),
        (async () => {
          await submit.click({ timeout: 3000 }).catch(()=>{});
          await sleep(700);
          const any = page.locator('[data-testid="button-submit-anyway"]').first();
          if (await any.count() > 0) await any.click({ timeout: 2000 }).catch(()=>{});
        })(),
      ]);
      return { approach: "tp_outline", reasoning: "Best-effort term paper module submission (outline only).", answer: outline };
    },
  });
}

// ---- F15 polling badge -----------------------------------------------------

async function fn15_pollingBadge(page) {
  if (isSkipped(15)) return;
  await record(page, {
    function_number: 15, function_name: FN_NAMES[15], context: "regular", suffix: "assessments observe",
    step: "Open /assessments and observe ai-score-badge polling for ~5s",
    expected_routes: [{ method: "GET", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    navigate: async () => { await page.goto(appUrl("/assessments"), { waitUntil: "domcontentloaded" }); await sleep(5500); },
    postCheck: async (rec) => {
      const submissionCalls = rec.app_response.network_calls.filter(c => /\/api\/submissions(?:[?#].*)?$/.test(c.url) && c.method === "GET");
      if (submissionCalls.length === 0) {
        rec.inline_failures.push("F15: ai-score-badge did not poll /api/submissions during the observation window");
      }
    },
  });
}

// ---- F16 diagnostic regression --------------------------------------------

async function fn16_diagRegression(page, beforeBody) {
  if (isSkipped(16)) return;
  await record(page, {
    function_number: 16, function_name: FN_NAMES[16], context: "anonymous", suffix: "system-after",
    step: "Re-run /api/diagnostic/system, diff against system-before.json",
    expected_routes: [{ method: "GET", url: /\/api\/diagnostic\/system(?:[?#].*)?$/ }],
  }, {
    navigate: async () => {
      await page.goto(appUrl("/diagnostic"), { waitUntil: "domcontentloaded" });
      await sleep(3500);
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/diagnostic\/system/.test(c.url) && c.method === "GET");
      if (!c) { rec.inline_failures.push("F16: no GET /diagnostic/system call"); return; }
      try {
        const body = JSON.parse(c.response_body || "{}");
        await fsp.writeFile(path.join(OUT_DIAG, "system-after.json"), JSON.stringify(body, null, 2));
        const beforeChecks = Array.isArray(beforeBody?.checks) ? beforeBody.checks : [];
        const afterChecks  = Array.isArray(body.checks) ? body.checks : [];
        const regressions = [];
        for (const before of beforeChecks) {
          const after = afterChecks.find(a => (a.id || a.name) === (before.id || before.name));
          if (after && (before.passed === true || before.status === "ok") && (after.passed === false || after.status === "fail")) {
            regressions.push({ check: before.name || before.id, was: "passed", now: "failed", message: after.message });
          }
        }
        if (regressions.length) {
          for (const r of regressions) OTHER_CRITICAL.push({ kind: "diagnostic_regression", ...r });
        }
        rec.invariant_results.push({ invariant: "K", passed: regressions.length === 0, note: `${regressions.length} regression(s) vs system-before.json`, evidence: regressions });
      } catch (e) { rec.inline_failures.push(`F16: diagnostic body unparseable: ${e.message}`); }
    },
  });
  // functional-after
  await record(page, {
    function_number: 16, function_name: FN_NAMES[16], context: "anonymous", suffix: "functional-after",
    step: "POST /api/diagnostic/functional one more time",
  }, {
    navigate: async () => {
      const btn = page.locator('[data-testid="diag-run-func"], button:has-text("Functional")').first();
      if (await btn.count() === 0) {
        await page.evaluate(() => fetch("/api/diagnostic/functional", { method: "POST" }).then(r=>r.text()).catch(()=>null));
        await sleep(8000);
      } else {
        await Promise.all([
          page.waitForResponse(r => /\/api\/diagnostic\/functional/.test(r.url()), { timeout: 30000 }).catch(()=>null),
          btn.click().catch(()=>{}),
        ]);
      }
    },
    postCheck: async (rec) => {
      const c = rec.app_response.network_calls.find(c => /\/api\/diagnostic\/functional/.test(c.url) && c.method === "POST");
      if (c) try { await fsp.writeFile(path.join(OUT_DIAG, "functional-after.json"), c.response_body); } catch {}
    },
  });
}

// ---- F17 edge cases --------------------------------------------------------

async function fn17_edgeCases(page) {
  if (isSkipped(17)) return;
  // empty content
  await record(page, {
    function_number: 17, function_name: FN_NAMES[17], context: "regular", suffix: "empty content",
    step: "POST /api/submissions with empty content — expect graceful 400",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const r = await page.evaluate(async () => {
        const r = await fetch("/api/submissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: "d5", content: "" }) });
        let t = ""; try { t = await r.text(); } catch {}
        return { status: r.status, body: t.slice(0, 300) };
      });
      return { approach: "edge_empty", reasoning: "Submit empty content and verify graceful 400, not 500.", answer: JSON.stringify(r) };
    },
  });
  // malformed moduleId
  await record(page, {
    function_number: 17, function_name: FN_NAMES[17], context: "regular", suffix: "malformed moduleId",
    step: "POST /api/submissions with moduleId='xyz' — expect 400",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const r = await page.evaluate(async () => {
        const r = await fetch("/api/submissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: "xyz", content: "Some content here that is long enough to not trip the empty check." }) });
        let t = ""; try { t = await r.text(); } catch {}
        return { status: r.status, body: t.slice(0, 300) };
      });
      return { approach: "edge_modid", reasoning: "Verify malformed moduleId returns 400.", answer: JSON.stringify(r) };
    },
  });
  // oversized content
  await record(page, {
    function_number: 17, function_name: FN_NAMES[17], context: "regular", suffix: "oversized content",
    step: "POST /api/submissions with 50k words — verify graceful handling",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      const r = await page.evaluate(async () => {
        const big = ("word ").repeat(50000);
        const r = await fetch("/api/submissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: "d6", content: big }) });
        let t = ""; try { t = await r.text(); } catch {}
        return { status: r.status, body: t.slice(0, 300) };
      });
      return { approach: "edge_huge", reasoning: "Verify the 250KB+ body is rejected gracefully (or accepted), not crashed.", answer: JSON.stringify(r) };
    },
  });
  // logged-out
  await record(page, {
    function_number: 17, function_name: FN_NAMES[17], context: "anonymous", suffix: "logged-out submit",
    step: "Submit while logged out — expect 401",
    expected_routes: [{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ }],
  }, {
    act: async () => {
      // Capture cookies, clear, restore.
      const ctx = page.context();
      const cookies = await ctx.cookies();
      await ctx.clearCookies();
      const r = await page.evaluate(async () => {
        const r = await fetch("/api/submissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: "d5", content: "Hello from a logged out session, this should 401." }) });
        let t = ""; try { t = await r.text(); } catch {}
        return { status: r.status, body: t.slice(0, 300) };
      });
      await ctx.addCookies(cookies);
      return { approach: "edge_unauth", reasoning: "Verify logged-out POST returns 401.", answer: JSON.stringify(r) };
    },
  });
}

// ---- F18 aggregate processScore audit (Invariant A run-wide) ----------------

async function fn18_aggregateAudit() {
  if (isSkipped(18)) return;
  const total = PROCESS_SCORE_RESPONSES.length;
  const leaks = PROCESS_SCORE_RESPONSES.filter(r => r.leak && r.leak.length);
  log(`F18 aggregate audit: ${total} processScore responses captured, ${leaks.length} leaks`);
  // already pushed into CRITICAL.A in real time; re-affirm here for the report
  try { await fsp.writeFile(path.join(OUT_PSCORE, "_aggregate-summary.json"), JSON.stringify({ total, leaks_count: leaks.length, leaks }, null, 2)); } catch {}
  return { total, leaks: leaks.length };
}

// =============================================================================
// REPORT BUILDERS
// =============================================================================

function htmlEscape(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function buildReport(records, outFile) {
  const byFn = new Map();
  for (const r of records) {
    if (!byFn.has(r.function_number)) byFn.set(r.function_number, []);
    byFn.get(r.function_number).push(r);
  }
  const fnNumbers = Array.from(byFn.keys()).sort((a,b)=>a-b);

  const toc = fnNumbers.map(n => `<li><a href="#f${n}">F${n} — ${htmlEscape(FN_NAMES[n] || "?")} (${byFn.get(n).length})</a></li>`).join("\n");

  const invariantSummary = `
<table class="inv">
  <tr><th>Inv</th><th>Description</th><th>Violations</th></tr>
  <tr><td>A</td><td>processScore endpoint never leaks features</td><td class="${CRITICAL.A.length?'bad':'ok'}">${CRITICAL.A.length}</td></tr>
  <tr><td>B</td><td>student-facing submissions strip process* columns</td><td class="${CRITICAL.B.length?'bad':'ok'}">${CRITICAL.B.length}</td></tr>
  <tr><td>C</td><td>sequential gating returns 403 with missing IDs</td><td class="${CRITICAL.C.length?'bad':'ok'}">${CRITICAL.C.length}</td></tr>
  <tr><td>D</td><td>processBaseline freezes at n=2</td><td class="${CRITICAL.D.length?'bad':'ok'}">${CRITICAL.D.length}</td></tr>
  <tr><td>E</td><td>sparse-data guard sets process* to null</td><td class="${CRITICAL.E.length?'bad':'ok'}">${CRITICAL.E.length}</td></tr>
  <tr><td>F</td><td>tutor SSE lifecycle + turn persistence</td><td class="${CRITICAL.F.length?'bad':'ok'}">${CRITICAL.F.length}</td></tr>
  <tr><td>G</td><td>draft workshop locks after first feedback</td><td class="${CRITICAL.G.length?'bad':'ok'}">${CRITICAL.G.length}</td></tr>
  <tr><td>H</td><td>accommodated mode bypasses forensics</td><td class="${CRITICAL.H.length?'bad':'ok'}">${CRITICAL.H.length}</td></tr>
  <tr><td>I</td><td>admin endpoints reject non-admin</td><td class="${CRITICAL.I.length?'bad':'ok'}">${CRITICAL.I.length}</td></tr>
  <tr><td>J</td><td>integrity disclosure gates module access</td><td class="${CRITICAL.J.length?'bad':'ok'}">${CRITICAL.J.length}</td></tr>
  <tr><td>K</td><td>diagnostic synthetic-forensics calibration</td><td class="${CRITICAL.K.length?'bad':'ok'}">${CRITICAL.K.length}</td></tr>
  <tr><td>L</td><td>submission hot path fast, background completes</td><td class="${CRITICAL.L.length?'bad':'ok'}">${CRITICAL.L.length}</td></tr>
</table>`;

  // Aggregate processScore table (F18 surface)
  const psRows = PROCESS_SCORE_RESPONSES.map((r,i) => `
<tr class="${r.leak && r.leak.length ? 'badrow' : ''}">
  <td>${i+1}</td><td>${htmlEscape(r.ctx)}</td><td>${htmlEscape(r.url)}</td>
  <td><code>${htmlEscape(JSON.stringify(r.body || {}).slice(0,200))}</code></td>
  <td>${r.leak && r.leak.length ? '<b class="bad">LEAK: '+htmlEscape(r.leak.join(", "))+'</b>' : 'clean'}</td>
</tr>`).join("");

  const interactionsHtml = fnNumbers.map(n => {
    const list = byFn.get(n);
    return `<section id="f${n}"><h2>F${n} — ${htmlEscape(FN_NAMES[n] || "?")}</h2>` +
      list.map(r => renderInteraction(r)).join("\n") + "</section>";
  }).join("\n");

  const html = `<!doctype html><meta charset="utf-8"><title>R1-v2 Report ${RUN_TS}</title>
<style>
body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#fafbfc;color:#1f2328}
.nav{position:sticky;top:0;background:#161b22;color:#c9d1d9;padding:10px 20px;z-index:10;border-bottom:1px solid #30363d}
.nav h1{margin:0;font-size:16px}
.nav details{display:inline-block;margin-left:20px}
.nav summary{cursor:pointer;color:#79c0ff}
.nav ul{margin:8px 0 0;padding-left:20px;font-size:13px}
.nav a{color:#79c0ff;text-decoration:none}
main{max-width:1200px;margin:0 auto;padding:24px 20px}
h2{font-size:22px;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid #d0d7de}
h3{font-size:16px;margin:24px 0 8px}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{padding:6px 10px;border:1px solid #d0d7de;text-align:left;font-size:13px;vertical-align:top}
th{background:#f6f8fa}
table.inv td:last-child{text-align:right;font-weight:600}
.ok{color:#1a7f37}.bad{color:#cf222e}.badrow{background:#fff5f5}
.warn{color:#9a6700}
.interaction{background:white;border:1px solid #d0d7de;border-radius:6px;padding:16px;margin:12px 0}
.interaction h3{margin-top:0}
.kv{display:grid;grid-template-columns:160px 1fr;gap:4px 12px;font-size:13px;margin:8px 0}
.kv b{color:#57606a;font-weight:500}
pre{background:#f6f8fa;padding:10px;border-radius:4px;overflow:auto;max-height:300px;font-size:12px;white-space:pre-wrap;word-break:break-word}
.shots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.shots img{width:100%;border:1px solid #d0d7de;border-radius:4px}
.call{font-size:12px;padding:6px 10px;border-left:3px solid #d0d7de;background:#f6f8fa;margin:4px 0}
.call.ok{border-color:#1a7f37}.call.warn{border-color:#9a6700}.call.bad{border-color:#cf222e}
.leak{background:#ffe0e0;border:1px solid #cf222e;padding:6px;border-radius:4px;font-size:12px;color:#82071e;margin:4px 0}
.judge{background:#fff8e0;border-left:3px solid #d4a72c;padding:8px 12px;border-radius:0 4px 4px 0;font-size:13px;margin:8px 0}
.concerns li{margin:2px 0}
.invres{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:4px;font-weight:600}
.invres.passed{background:#dafbe1;color:#1a7f37}
.invres.failed{background:#ffdce0;color:#cf222e}
.pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:#eaeef2;margin-right:6px}
</style>
<div class="nav">
  <h1>R1-v2 Run · ${RUN_TS}</h1>
  <details><summary>Contents</summary><ul>${toc}</ul></details>
</div>
<main>
  <h2>Invariants summary</h2>
  ${invariantSummary}
  <h3>Aggregate processScore audit (Invariant A surface, ${PROCESS_SCORE_RESPONSES.length} responses)</h3>
  ${PROCESS_SCORE_RESPONSES.length === 0 ? "<p><i>No processScore responses captured this run.</i></p>" : `
  <table><tr><th>#</th><th>ctx</th><th>url</th><th>response body (truncated 200 chars)</th><th>leak check</th></tr>${psRows}</table>`}
  ${interactionsHtml}
</main>`;
  await fsp.writeFile(outFile, html);
}

function renderInteraction(r) {
  const shots = (r.screenshots || []).filter(Boolean).map(s => `<img src="${htmlEscape(s)}" alt="">`).join("");
  const calls = (r.app_response.network_calls || []).map(c => {
    const cls = c.status >= 500 ? "bad" : c.status >= 400 ? "warn" : "ok";
    let leakHtml = "";
    if (c.process_score_leak && c.process_score_leak.length) {
      leakHtml = `<div class="leak">INVARIANT A LEAK: ${htmlEscape(c.process_score_leak.join(", "))}</div>`;
    }
    return `<div class="call ${cls}"><b>${htmlEscape(c.method)}</b> ${htmlEscape(c.url)} → ${c.status} (${c.duration_ms}ms)<br>
      <small>req:</small> <code>${htmlEscape((c.request_body||"").slice(0,250))}</code><br>
      <small>res:</small> <code>${htmlEscape((c.response_body||"").slice(0,400))}</code>${leakHtml}</div>`;
  }).join("");
  const invs = (r.invariant_results || []).map(i =>
    `<span class="invres ${i.passed?'passed':'failed'}">Inv ${i.invariant}: ${i.passed ? "PASS" : "FAIL"}</span><small> ${htmlEscape(i.note||"")}</small>`).join("<br>");
  const concernsHtml = r.judge_concerns.length
    ? `<ul class="concerns">${r.judge_concerns.map(c => `<li><b class="warn">⚠</b> ${htmlEscape(c)}</li>`).join("")}</ul>`
    : "<p><i>(no concerns)</i></p>";
  const inlineFails = r.inline_failures.length
    ? `<div class="leak">${r.inline_failures.map(htmlEscape).join("<br>")}</div>` : "";

  return `<div class="interaction"><h3>#${r.interaction_index} · ${htmlEscape(r.step_description)} <span class="pill">${htmlEscape(r.context)}</span>${r.module_id ? `<span class="pill">${htmlEscape(r.module_id)}</span>` : ""}</h3>
  <div class="kv">
    <b>ts</b><div>${htmlEscape(r.ts)}</div>
    <b>url</b><div>${htmlEscape(r.url)}</div>
    <b>R1 approach</b><div>${htmlEscape(r.r1_approach||"—")}</div>
    <b>R1 reasoning</b><div>${htmlEscape(r.r1_reasoning||"—")}</div>
  </div>
  <h4>R1 input (verbatim)</h4>
  <pre>${htmlEscape((r.r1_input||"(none)").slice(0, 4000))}</pre>
  <h4>Invariant checks</h4>
  <div>${invs || "<i>(none in this step)</i>"}</div>
  ${inlineFails}
  <h4>Screenshots</h4>
  <div class="shots">${shots}</div>
  <h4>Network calls (${(r.app_response.network_calls||[]).length})</h4>
  ${calls || "<i>(none)</i>"}
  <h4>Browser console errors</h4>
  <pre>${htmlEscape((r.app_response.errors_in_console||[]).join("\n") || "(none)")}</pre>
  <h4>Judge critique</h4>
  <div class="judge">${htmlEscape(r.judge_critique||"(none)")}</div>
  <h4>Judge concerns (${r.judge_concerns.length})</h4>
  ${concernsHtml}
  </div>`;
}

async function buildFailures(records, outFile) {
  const lines = ["# R1-v2 Failures Report", "", `Run: ${RUN_TS}`, "", "## CRITICAL INVARIANT VIOLATIONS", ""];
  const invDesc = {
    A: "processScore leaked features",
    B: "student-facing submissions response contained process* fields",
    C: "sequential gating broken",
    D: "processBaseline updated past n=2",
    E: "sparse-data guard failed",
    F: "tutor SSE lifecycle broken",
    G: "draft workshop lock broken",
    H: "accommodated mode still triggered forensics",
    I: "admin endpoint accessible to non-admin",
    J: "integrity disclosure modal bypassable",
    K: "diagnostic synthetic-forensics calibration failed",
    L: "submission hot path slow OR background check stuck",
  };
  let totalInv = 0;
  for (const letter of "ABCDEFGHIJKL") {
    const list = CRITICAL[letter] || [];
    totalInv += list.length;
    if (list.length === 0) { lines.push(`### Invariant ${letter} — ${invDesc[letter]}: **0** ✅`); lines.push(""); continue; }
    lines.push(`### Invariant ${letter} — ${invDesc[letter]}: **${list.length}** ❌`);
    for (const v of list) {
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(v, null, 2).slice(0, 2000));
      lines.push("```");
    }
    lines.push("");
  }
  if (OTHER_CRITICAL.length) {
    lines.push("## Other critical findings");
    lines.push("");
    for (const o of OTHER_CRITICAL) {
      lines.push(`- **${o.kind}** — ${JSON.stringify(o).slice(0, 500)}`);
    }
    lines.push("");
  }

  lines.push("## Judge concerns (linked to interactions)");
  lines.push("");
  let anyJudge = false;
  for (const r of records) {
    if (!r.judge_concerns.length && !r.inline_failures.length) continue;
    anyJudge = true;
    lines.push(`### #${r.interaction_index} F${r.function_number} ${r.function_name}${r.module_id?` · ${r.module_id}`:""}`);
    lines.push(`- URL: ${r.url}`);
    if (r.judge_concerns.length) {
      lines.push(`- Judge concerns (${r.judge_concerns.length}):`);
      for (const c of r.judge_concerns) lines.push(`  - ${c}`);
    }
    if (r.inline_failures.length) {
      lines.push(`- Inline failures:`);
      for (const f of r.inline_failures) lines.push(`  - ${f}`);
    }
    if (r.judge_critique) {
      lines.push("");
      lines.push("> " + r.judge_critique.split("\n").join("\n> "));
    }
    if (r.screenshots && r.screenshots[2]) lines.push(`\n![after-response](${r.screenshots[2]})`);
    lines.push("");
  }
  if (!anyJudge) lines.push("(no judge concerns)\n");
  await fsp.writeFile(outFile, lines.join("\n"));
}

// =============================================================================
// SANITY CHECK
// =============================================================================

function sanityCheck(records) {
  const ran = new Set(records.map(r => r.function_number));
  for (const f of ATTEMPTED_FUNCTIONS) {
    if (!ran.has(f)) SANITY_FAILURES.push(`SANITY: function F${f} was attempted but produced no interaction`);
  }
  for (const r of records) {
    // r1 input length for steps where R1 was supposed to act
    if (r.is_interactive && (!r.r1_input || r.r1_input.trim().length < 10)) {
      SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} (F${r.function_number}) has r1_input < 10 chars`);
    }
    // expected_routes matched
    for (const er of r.expected_routes || []) {
      const re = er.url instanceof RegExp ? er.url : new RegExp(er.url);
      const matched = (r.app_response.network_calls||[]).some(c => c.method === er.method.toUpperCase() && re.test(c.url));
      if (!matched) SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} (F${r.function_number}) expected ${er.method} ${re} but matched 0`);
    }
    // screenshots
    const abs = (r.screenshots || []).filter(Boolean).map(s => path.join(RUN_DIR, s));
    const present = abs.every(p => existsSync(p));
    if (!present) { SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} missing screenshot file`); }
    else if (r.is_interactive && abs.length === 3) {
      try {
        const sizes = abs.map(p => statSync(p).size);
        const bytes = abs.map(p => readFileSync(p));
        if (sizes[0] === sizes[1] && sizes[1] === sizes[2] && bytes[0].equals(bytes[1]) && bytes[1].equals(bytes[2])) {
          SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} all 3 screenshots byte-identical (page never changed)`);
        }
      } catch {}
    }
    // judge critique length
    const wc = (r.judge_critique || "").split(/\s+/).filter(Boolean).length;
    if (wc < 30) SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} judge_critique only ${wc} words`);
    // inline failures roll up
    for (const f of r.inline_failures || []) SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index}: ${f}`);
  }
  // F18 aggregate audit must have evaluated processScore responses (or explicit "none observed")
  // -- considered acceptable to have 0 if the live canvas never reached threshold this run.
  liveState.sanity_count = SANITY_FAILURES.length;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log(`R1-v2 is running.`);
  log(`Live view:    http://localhost:${LIVE_VIEW_PORT}`);
  log(`Output dir:   ${RUN_DIR}`);
  log(`Watch the live view — especially the "processScore body" surface.`);
  log(`The most critical invariant is A: no features in processScore responses.`);
  log(`Do not trust summary output alone.`);
  log(`Config: APP_URL=${APP_URL} APP_BASE=${APP_BASE || "''"} HEADLESS=${HEADLESS} MAX_MODULES=${MAX_MODULES}`);
  log(`Models: writer=${ANTHROPIC_MODEL} judge=${JUDGE_MODEL}`);
  log(`Skip:   ${[...SKIP_FUNCTIONS].join(",") || "(none)"}`);

  startLiveServer();

  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const regularContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const regularPage = await regularContext.newPage();
  attachNetworkCapture(regularPage, "regular");
  await installSseProbe(regularPage);

  // Admin context (separate browser context so cookies don't collide)
  let adminContext = null;
  let adminPage = null;
  try {
    adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    adminPage = await adminContext.newPage();
    attachNetworkCapture(adminPage, "admin");
    if (R1_ADMIN_EMAIL) {
      log(`Admin path: logging in with R1_ADMIN_EMAIL=${R1_ADMIN_EMAIL}`);
      await loginUI(adminPage, R1_ADMIN_EMAIL, "R1 Admin (preset)");
      const me = await meCall(adminContext);
      if (!me.json?.student?.isAdmin) {
        log(`Admin path: R1_ADMIN_EMAIL student is NOT admin in DB; admin verification partial.`);
        await adminContext.close(); adminContext = null;
      }
    } else {
      await loginUI(adminPage, R1_ADMIN_AUTOEMAIL, R1_ADMIN_NAME);
      const boot = await bootstrapAdmin(adminContext);
      log(`Admin bootstrap status=${boot.status} body=${(boot.text||"").slice(0,200)}`);
      const me = await meCall(adminContext);
      if (!me.json?.student?.isAdmin) {
        log(`Admin path: bootstrap failed (likely an admin already exists). Admin-required invariants will be PARTIALLY verified.`);
        await adminContext.close(); adminContext = null;
      } else {
        log(`Admin path established as ${R1_ADMIN_AUTOEMAIL}.`);
      }
    }
  } catch (e) {
    logErr(`Admin context init failed: ${e.message}`);
    if (adminContext) { try { await adminContext.close(); } catch {} adminContext = null; }
  }

  let systemBefore = null;
  let regularStudentId = null;

  try {
    systemBefore = await fn1_diagnosticSystem(regularPage);
    await fn2_healthAuthCross(regularPage, regularContext, browser);

    // capture regular student id
    const meR = await meCall(regularContext);
    regularStudentId = meR?.json?.student?.id || null;
    log(`Regular student id: ${regularStudentId}`);

    await fn3_syllabusModules(regularPage);
    await fn4_disclosureGate(regularPage, regularContext);
    await fn5_sequentialGating(regularPage, regularContext);

    // get curriculum text for d1
    let curriculum = { reading: "", assignment: "" };
    try {
      await regularPage.goto(appUrl("/modules/d1"), { waitUntil: "domcontentloaded" });
      await sleep(800); await dismissDisclosureIfPresent(regularPage);
      const body = await regularPage.locator("body").innerText({ timeout: 2500 }).catch(()=> "");
      curriculum.reading = body.slice(0, 3500);
      curriculum.assignment = body.slice(0, 1500);
    } catch {}

    await fn6_d1_happyPath(regularPage, curriculum);
    await fn7_sparseDataSubmission(regularPage, adminContext);
    await fn8_pasteBlock(regularPage);
    await fn9_tutorSse(regularPage);
    await fn10_inlineAi(regularPage);
    await fn11_baselineFreeze(regularPage, adminContext, regularStudentId);
    await fn12_accommodated(regularPage, adminContext, browser);
    await fn13_adminEnforcement(regularPage, adminContext, regularStudentId);

    // F14 only if budget — skipped by default in smoke mode
    await fn14_termPaper(regularPage);
    await fn15_pollingBadge(regularPage);
    await fn16_diagRegression(regularPage, systemBefore);
    await fn17_edgeCases(regularPage);
    await fn18_aggregateAudit();
  } catch (e) {
    logErr(`FATAL: ${e.message}\n${e.stack}`);
    OTHER_CRITICAL.push({ kind: "harness_uncaught", message: e.message, stack: (e.stack||"").slice(0, 1000) });
  } finally {
    try { await regularContext.close(); } catch {}
    if (adminContext) { try { await adminContext.close(); } catch {} }
    try { await browser.close(); } catch {}
  }

  transcriptStream.end();
  await new Promise(r => transcriptStream.on("close", r));
  const lines = readFileSync(path.join(RUN_DIR, "transcript.jsonl"), "utf8").split("\n").filter(Boolean);
  const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  await buildReport(records, path.join(RUN_DIR, "report.html"));
  await buildFailures(records, path.join(RUN_DIR, "failures.md"));
  sanityCheck(records);

  // Run summary
  const totalConcerns = records.reduce((s, r) => s + (r.judge_concerns?.length || 0), 0);
  const totalCrit = totalCritical();
  const perInv = "ABCDEFGHIJKL".split("").map(L => `  Invariant ${L}: ${CRITICAL[L].length}${L==="A"?"     ← MOST CRITICAL":""}`).join("\n");
  const summary = [
    `INTERACTIONS: ${records.length}`,
    `JUDGE CONCERNS RAISED: ${totalConcerns}`,
    `CRITICAL INVARIANT VIOLATIONS: ${totalCrit}`,
    perInv,
    `DIAGNOSTIC REGRESSIONS: ${OTHER_CRITICAL.filter(o=>o.kind==="diagnostic_regression").length}`,
    `HARNESS SANITY FAILURES: ${SANITY_FAILURES.length}`,
  ].join("\n");
  await fsp.writeFile(path.join(RUN_DIR, "run-summary.txt"), summary + "\n");

  log("\n========== RUN SUMMARY ==========");
  log(summary);
  if (SANITY_FAILURES.length) {
    log("\nSANITY DETAILS:");
    for (const f of SANITY_FAILURES) logErr(f);
  }
  log("=================================\n");
  log(`R1-v2 finished.`);
  log(`Open the report:        ${path.join(RUN_DIR, "report.html")}`);
  log(`Open the failures:      ${path.join(RUN_DIR, "failures.md")}`);
  log(`Diagnostic before/after: ${OUT_DIAG}`);
  log(`ProcessScore responses:  ${OUT_PSCORE}`);
  log(`Student-facing responses: ${OUT_SFACE}`);
  log(`Baseline snapshots:       ${OUT_BASELINE}`);
  log(`SSE streams:              ${SSE_DIR}`);
  log(`Raw transcript:           ${path.join(RUN_DIR, "transcript.jsonl")}`);
  log(`Raw network log:          ${path.join(RUN_DIR, "network.log")}`);

  liveState.finished = true;
  liveState.run_summary = summary;
  liveState.critical_count = totalCrit;
  liveState.sanity_count = SANITY_FAILURES.length;
  const tailMs = parseInt(process.env.LIVE_VIEW_TAIL_MS || "60000", 10);
  log(`Live view will remain available for ${Math.round(tailMs/1000)} s, then exit.`);

  let exitCode = 0;
  if (totalConcerns > 0) exitCode = 1;
  if (totalCrit > 0) exitCode = 2;
  if (SANITY_FAILURES.length > 0) exitCode = 3;

  await sleep(tailMs);
  try { liveServer && liveServer.close(); } catch {}
  try { networkStream.end(); consoleStream.end(); } catch {}
  process.exit(exitCode);
}

main().catch(e => { logErr(`UNCAUGHT: ${e.message}\n${e.stack}`); process.exit(2); });
