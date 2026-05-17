#!/usr/bin/env node
// =============================================================================
// R1 — SYNTHETIC-STUDENT BETA-TESTER FOR PHILOSOPHY 101
// =============================================================================
// One file by design. See R1_BLUEPRINT.md for the complete reference.
// Sections (top-to-bottom): CONFIG → OUTPUT DIRECTORY + console tee → ANTHROPIC
// CLIENT → LIVE VIEW HTTP SERVER → NETWORK CAPTURE → WRITER BRAIN → JUDGE BRAIN
// → INVARIANT CHECKER → INTERACTION RECORDER → typeWithLive → HELPERS →
// FUNCTION DRIVERS (F1..F9) → REPORT BUILDERS → SANITY CHECK → CURRICULUM FETCH
// → MAIN.
// =============================================================================

import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { promises as fsp, createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdirSync } from "node:fs";
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
const R1_EMAIL         = process.env.R1_EMAIL         || `r1-${Date.now()}@beta.test`;
const R1_NAME          = process.env.R1_NAME          || "R1 Beta Tester";

const MODULE_IDS = (process.env.MODULE_IDS
  ? process.env.MODULE_IDS.split(",").map(s => s.trim()).filter(Boolean)
  : ["d1","e1","d2","e2","d3","e3","d4","e4","d5","e5","d6","d7"]);

const APPROACHES = [
  { id: "competent_thorough",     description: "A well-formed, on-topic answer that should pass cleanly." },
  { id: "weak_off_topic",         description: "An on-topic-looking answer that misses the actual prompt." },
  { id: "minimal_terse",          description: "Bare-minimum length to test what the system tolerates." },
  { id: "rambling_padded",        description: "Long, repetitive padding to test whether length games help." },
  { id: "ai_voice_obvious",       description: "Deliberately AI-sounding cadence to provoke the detectors." },
  { id: "human_voice_with_typos", description: "Conversational with realistic typos and self-corrections." },
  { id: "edgy_provocative",       description: "On-topic but takes a contrarian/edgy stance to test tone handling." },
  { id: "format_breaker",         description: "Tries unusual formatting (bullets, headings, code blocks) to test rendering." },
];

const RUN_TS = new Date().toISOString().replace(/[:.]/g, "-");

// =============================================================================
// OUTPUT DIRECTORY + console tee
// =============================================================================

const RUN_DIR        = path.join(__dirname, "runs", RUN_TS);
const SCREENSHOT_DIR = path.join(RUN_DIR, "screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

// Run-global state for end-of-run reporting
const CRITICAL = [];              // deterministic invariant violations
const SANITY_FAILURES = [];       // sanity-check findings
const ATTEMPTED_FUNCTIONS = new Set();

// =============================================================================
// ANTHROPIC CLIENT
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
    "AI_INTEGRATIONS_ANTHROPIC_BASE_URL (+ optional AI_INTEGRATIONS_ANTHROPIC_API_KEY).",
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
  let t = String(text).trim();
  // Strip ```json fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // Try strict parse first
  try { return JSON.parse(t); } catch {}
  // Find first { ... last }
  const first = t.indexOf("{");
  const last  = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = t.slice(first, last + 1);
    return JSON.parse(slice);
  }
  throw new Error("no JSON object found in reply");
}

// =============================================================================
// LIVE VIEW HTTP SERVER
// =============================================================================

const liveState = {
  started_at:       ts(),
  current_function: null,        // e.g. "F6 Draft Workshop"
  current_module:   null,
  current_url:      null,
  r1_approach:      null,
  r1_reasoning:     null,
  r1_input_so_far:  "",
  latest_screenshot:null,        // relative path like "screenshots/0006-typed.png"
  latest_page_text: "",
  latest_calls:     [],          // [{ method, url, status, body_preview }]
  latest_judge:     "",
  events:           [],          // [{ idx, fn, module, concerns }]
  finished:         false,
  run_summary:      "",
};

function liveHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>R1 Live View</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #0c0d10; color: #e8e8ea; }
  header { padding: 12px 18px; background: #14161b; border-bottom: 1px solid #2a2d34; display:flex; justify-content:space-between; align-items:center; }
  header h1 { margin:0; font-size: 15px; font-weight:600; letter-spacing:.5px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; }
  .panel { background:#14161b; border:1px solid #2a2d34; border-radius:8px; padding:12px; max-height: 480px; overflow:auto; }
  .panel h2 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.7px; color:#7a8290; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; margin:0; }
  .kv { font-size: 12px; line-height: 1.55; }
  .kv b { color:#9aa3b1; }
  img { max-width: 100%; border-radius: 6px; border:1px solid #2a2d34; }
  .call { font-size: 11px; border-bottom: 1px dashed #2a2d34; padding: 4px 0; }
  .call b { color:#9bd; }
  .ev { font-size:11px; padding: 3px 0; border-bottom: 1px dashed #2a2d34; }
  .ev .warn { color:#f5a623; }
  .banner { padding:10px 18px; background:#1e3a1e; color:#cfe7c8; font-size:13px; }
</style></head>
<body>
<header>
  <h1>R1 LIVE VIEW · <span id="fn">…</span></h1>
  <div id="status" style="font-size:11px;color:#7a8290;">starting…</div>
</header>
<div id="finished"></div>
<div class="grid">
  <div class="panel"><h2>R1 right now</h2>
    <div class="kv" id="now"></div>
    <h2 style="margin-top:10px;">R1 is typing</h2>
    <pre id="typing"></pre>
  </div>
  <div class="panel"><h2>Latest screenshot</h2>
    <img id="shot" src="" alt="(no screenshot yet)"/>
  </div>
  <div class="panel"><h2>Page text after step</h2>
    <pre id="page"></pre>
  </div>
  <div class="panel"><h2>/api/* calls</h2>
    <div id="calls"></div>
    <h2 style="margin-top:10px;">Judge critique</h2>
    <pre id="judge"></pre>
  </div>
  <div class="panel" style="grid-column: 1 / -1;"><h2>Event log</h2>
    <div id="events"></div>
  </div>
</div>
<script>
function esc(s){ return String(s||"").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
async function tick(){
  try {
    const r = await fetch("/state"); const s = await r.json();
    document.getElementById("fn").textContent = (s.current_function || "(idle)") + (s.current_module ? " · "+s.current_module : "");
    document.getElementById("status").textContent = s.finished ? "FINISHED" : "running…";
    document.getElementById("now").innerHTML =
      "<div><b>URL:</b> " + esc(s.current_url||"") + "</div>" +
      "<div><b>Approach:</b> " + esc(s.r1_approach||"-") + "</div>" +
      "<div><b>Reasoning:</b> " + esc(s.r1_reasoning||"-") + "</div>";
    document.getElementById("typing").textContent = s.r1_input_so_far || "";
    document.getElementById("page").textContent = (s.latest_page_text||"").slice(0,4000);
    document.getElementById("judge").textContent = s.latest_judge || "";
    if (s.latest_screenshot) document.getElementById("shot").src = "/screenshot?p=" + encodeURIComponent(s.latest_screenshot) + "&t=" + Date.now();
    document.getElementById("calls").innerHTML = (s.latest_calls||[]).map(c =>
      "<div class='call'><b>"+esc(c.method)+"</b> "+esc(c.url)+" → "+esc(String(c.status))+
      "<br/>"+esc((c.body_preview||"").slice(0,400))+"</div>"
    ).join("");
    document.getElementById("events").innerHTML = (s.events||[]).slice().reverse().map(e =>
      "<div class='ev'>#" + e.idx + " · " + esc(e.fn) + (e.module ? " · "+esc(e.module) : "") +
      (e.concerns ? " <span class='warn'>· " + e.concerns + " concerns</span>" : "") + "</div>"
    ).join("");
    if (s.finished) {
      document.getElementById("finished").innerHTML =
        '<div class="banner">RUN COMPLETE — open report.html in the run folder. ' + esc(s.run_summary).replace(/\\n/g,"<br/>") + '</div>';
    }
  } catch(e){}
  setTimeout(tick, 500);
}
tick();
</script>
</body></html>`;
}

let liveServer = null;
function startLiveServer() {
  liveServer = http.createServer((req, res) => {
    try {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(liveHtml());
        return;
      }
      if (req.url === "/state") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(liveState));
        return;
      }
      if (req.url && req.url.startsWith("/screenshot")) {
        const url = new URL(req.url, "http://x");
        const rel = url.searchParams.get("p") || "";
        const file = path.join(RUN_DIR, rel);
        if (!file.startsWith(RUN_DIR) || !existsSync(file)) {
          res.writeHead(404); res.end(); return;
        }
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        res.end(readFileSync(file));
        return;
      }
      res.writeHead(404); res.end();
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  liveServer.listen(LIVE_VIEW_PORT, () => {
    log(`Live view: http://localhost:${LIVE_VIEW_PORT}`);
  });
}

// =============================================================================
// NETWORK CAPTURE
// =============================================================================

let currentNetBuffer = [];   // drained per interaction
let consoleErrors    = [];   // drained per interaction
const pendingByReqId = new Map();   // requestId-ish → { method, url, ts, requestBody }

function isApiUrl(u) {
  try {
    const url = new URL(u);
    return url.pathname.startsWith("/api/");
  } catch { return false; }
}

function attachNetworkCapture(page) {
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      consoleErrors.push(t);
    }
  });
  page.on("pageerror", err => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  page.on("request", req => {
    const url = req.url();
    if (!isApiUrl(url)) return;
    let body = null;
    try { body = req.postData(); } catch {}
    pendingByReqId.set(req, { method: req.method(), url, ts: Date.now(), requestBody: body });
  });

  page.on("response", async resp => {
    const req = resp.request();
    const meta = pendingByReqId.get(req);
    if (!meta) return;
    pendingByReqId.delete(req);
    let respBody = ""; let truncated = false;
    try {
      const buf = await resp.body();
      const MAX = 8 * 1024;
      if (buf.length > MAX) { respBody = buf.slice(0, MAX).toString("utf8"); truncated = true; }
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
    };
    currentNetBuffer.push(rec);
    networkStream.write(JSON.stringify(rec) + "\n");
    // update live view
    liveState.latest_calls = currentNetBuffer.slice(-6).map(c => ({
      method: c.method, url: c.url, status: c.status,
      body_preview: (c.response_body || "").slice(0, 300),
    }));
  });
}

// =============================================================================
// R1 WRITER BRAIN
// =============================================================================

async function r1WriteAnswer({ functionName, moduleId, reading, assignment }) {
  const approachesText = APPROACHES.map(a => `- ${a.id}: ${a.description}`).join("\n");
  const sys = `You are R1, a synthetic philosophy student beta-testing a course app. Your job is to deliberately EXERCISE the app's behavior — not to ace the assignment. Pick exactly ONE approach from this list:

${approachesText}

Then write an answer that embodies it. Stay on topic. Length 250–700 words (150–400 for minimal_terse; 800–1200 for rambling_padded). For human_voice_with_typos: include 3–6 realistic typos and at least 1 self-correction in parens. For ai_voice_obvious: very even cadence, transitional phrases like "Furthermore," / "It is important to note," etc. NEVER break persona by saying "I am an AI" or naming the test approach in the answer text itself.

Return STRICT JSON with exactly these keys:
{"approach": "<one of the ids above>", "reasoning": "<1-2 sentences on why you picked this approach for this step>", "answer": "<the full answer R1 will type, verbatim>"}`;

  const userMsg = `FUNCTION: ${functionName}
MODULE: ${moduleId}
READING (first 4000 chars):
${(reading || "(none captured)").slice(0, 4000)}

ASSIGNMENT PROMPT:
${(assignment || "(none captured)").slice(0, 2000)}`;

  try {
    const m = await withTimeout(
      anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system: sys,
        messages: [{ role: "user", content: userMsg }],
      }),
      CLAUDE_TIMEOUT_MS,
      "writer brain",
    );
    const text = (m.content[0]?.text) || "";
    try {
      const parsed = parseJsonLoose(text);
      if (!parsed.approach || !parsed.answer) throw new Error("missing fields");
      return parsed;
    } catch (e) {
      logErr(`R1 returned unparseable JSON; fallback applied. raw=${text.slice(0, 300)}`);
      return {
        approach: "competent_thorough",
        reasoning: "Fallback baseline because writer brain JSON failed to parse.",
        answer: fallbackAnswer(functionName, moduleId, assignment),
      };
    }
  } catch (e) {
    logErr(`writer brain error: ${e.message}; using fallback answer`);
    return {
      approach: "competent_thorough",
      reasoning: `Fallback baseline because writer brain errored: ${e.message}`,
      answer: fallbackAnswer(functionName, moduleId, assignment),
    };
  }
}

function fallbackAnswer(fn, moduleId, assignment) {
  return `This response engages directly with the assigned prompt for module ${moduleId}. The text below is generated by the R1 fallback path because the writer brain could not return a parseable answer; the harness records this so the human reviewer notices. The argument here aims to be on-topic enough to exercise the course app's submission path while remaining transparent about its origin. A reader auditing this run should treat this fallback as a low-information stress test of the upload and review pipeline rather than a graded answer. The prompt asked, in essence: ${(assignment || "(prompt not captured)").slice(0, 400)}. A reasonable response begins by isolating what the question is actually asking, then proposes a position, defends it against one objection, and closes with what would change the author's mind. Without the reading in context this fallback can only gesture at content, but the surface area of the submission — length, structure, paragraphing, and word count — is enough to drive every server-side check that fires on POST /api/submissions and POST /api/canvas/${moduleId}/score in this beta-test environment.`;
}

// =============================================================================
// JUDGE BRAIN
// =============================================================================

async function judge(record) {
  const sys = `You are a senior pedagogy + product reviewer auditing a college philosophy course app. You are NOT grading the student. You are reviewing the COURSE APP'S behavior given what the student did. Read the raw evidence below and produce STRICT JSON:

{"critique": "<2-5 sentence prose paragraph judging the course's behavior in this interaction>", "concerns": ["<specific, evidence-backed string>", ...]}

Concerns must be specific and evidence-backed. Examples:
- "POST /api/canvas/d1/processScore returned feature names — this is an invariant violation."
- "Tutor produced a complete submittable essay when asked to ghostwrite — invariant violation."
- "Submission card never appeared after POST /api/submissions returned 200."
- "GPTZero badge stuck in 'pending' for >30s — likely a polling bug."
- "Draft Workshop did not lock after feedback returned."
- "Live process score returned an http 5xx."

Empty array if nothing concerning. Do NOT moralize about the answer's quality — focus on the APP.`;

  const calls = (record.app_response.network_calls || []).map(c =>
    `- ${c.method} ${c.url} → ${c.status} (${c.duration_ms}ms)\n  req: ${(c.request_body||"").slice(0,200)}\n  res: ${(c.response_body||"").slice(0,200)}`
  ).join("\n");

  const userMsg = `FUNCTION: ${record.function_name}
MODULE: ${record.module_id || "(none)"}
STEP: ${record.step_description}
URL: ${record.url}

R1 APPROACH: ${record.r1_approach || "(read-only)"}
R1 REASONING: ${record.r1_reasoning || "(read-only)"}

R1 INPUT (first 4000 chars):
${(record.r1_input || "(none)").slice(0, 4000)}

PAGE TEXT AFTER (first 4000 chars):
${(record.app_response.page_text_after || "").slice(0, 4000)}

SUBMISSION-CARD HTML (first 2000 chars):
${(record.app_response.submission_card_html || "(none)").slice(0, 2000)}

NETWORK CALLS:
${calls || "(no /api/* calls captured)"}

BROWSER CONSOLE ERRORS (first 10):
${(record.app_response.errors_in_console || []).slice(0, 10).join("\n") || "(none)"}`;

  try {
    const m = await withTimeout(
      anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 1500,
        system: sys,
        messages: [{ role: "user", content: userMsg }],
      }),
      CLAUDE_TIMEOUT_MS,
      "judge brain",
    );
    const text = m.content[0]?.text || "";
    try {
      const parsed = parseJsonLoose(text);
      record.judge_critique = String(parsed.critique || "").trim();
      record.judge_concerns = Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [];
    } catch (e) {
      record.judge_critique = text;
      record.judge_concerns = ["judge_unparseable_response"];
    }
  } catch (e) {
    record.judge_critique = `(judge error: ${e.message})`;
    record.judge_concerns = ["judge_call_failed"];
  }
}

// =============================================================================
// INVARIANT CHECKER (deterministic, no Claude)
// =============================================================================

function checkInvariants(record) {
  const out = [];
  for (const c of (record.app_response.network_calls || [])) {
    if (c.status >= 500) {
      out.push(`5xx from ${c.method} ${c.url} (status ${c.status})`);
    }
    if (/\/api\/canvas\/[^/]+\/processScore(?:[?#].*)?$/.test(c.url) && c.method === "POST") {
      try {
        const body = JSON.parse(c.response_body || "{}");
        const allowed = new Set(["score", "class"]);
        const extra = Object.keys(body || {}).filter(k => !allowed.has(k));
        if (extra.length > 0) {
          out.push(`processScore tuning-oracle leak: extra keys ${JSON.stringify(extra)} in response`);
        }
      } catch {}
    }
    if (/\/api\/submissions\/module\/[^/]+(?:[?#].*)?$/.test(c.url) && c.method === "GET") {
      const txt = c.response_body || "";
      const leakKeys = ["processScore", "processClass", "processFeatures", "processFlags"];
      const leaked = leakKeys.filter(k => txt.includes(`"${k}"`));
      if (leaked.length > 0) {
        out.push(`student-facing forensics leak in GET ${c.url}: ${leaked.join(", ")}`);
      }
    }
  }
  record.invariant_violations = out;
  for (const v of out) {
    CRITICAL.push({ interaction: record.interaction_index, why: v });
  }
}

// =============================================================================
// INTERACTION RECORDER
// =============================================================================

let interactionCounter = 0;

async function snap(page, label) {
  interactionCounter; // no-op; counter incremented in record()
  const idx = String(interactionCounter).padStart(4, "0");
  const rel = `screenshots/${idx}-${label}.png`;
  const abs = path.join(RUN_DIR, rel);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(()=>{});
      await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(()=>{});
      await sleep(250);
      await page.screenshot({ path: abs, fullPage: false });
      liveState.latest_screenshot = rel;
      return rel;
    } catch (e) {
      if (attempt === 1) {
        logErr(`screenshot ${rel} failed: ${e.message}`);
        return null;
      }
      await sleep(300);
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normaliseExpects(expects) {
  if (expects === false) return { kind: "none" };
  if (expects === true)  return { kind: "any" };
  if (expects && typeof expects === "object" && expects.method && expects.url) {
    const re = expects.url instanceof RegExp ? expects.url : new RegExp(expects.url);
    return { kind: "strict", method: String(expects.method).toUpperCase(), urlRe: re };
  }
  return { kind: "none" };
}

async function record(page, meta, { navigate, act, submit } = {}) {
  interactionCounter += 1;
  ATTEMPTED_FUNCTIONS.add(meta.function_number);
  const idx = interactionCounter;

  // 1. reset per-interaction buffers BEFORE navigation
  currentNetBuffer = [];
  consoleErrors    = [];
  liveState.current_function = `F${meta.function_number} ${meta.function_name}`;
  liveState.current_module   = meta.module_id || null;
  liveState.r1_approach      = null;
  liveState.r1_reasoning     = null;
  liveState.r1_input_so_far  = "";
  liveState.latest_page_text = "";
  liveState.latest_calls     = [];
  liveState.latest_judge     = "";

  const inlineFailures = [];

  log(`-- #${idx} F${meta.function_number} ${meta.function_name}${meta.module_id ? " · " + meta.module_id : ""} --`);

  // 2. navigate (inside capture window)
  if (navigate) {
    try {
      await navigate();
      await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(()=>{});
      await dismissDisclosureIfPresent(page);
    } catch (e) {
      logErr(`navigate failed: ${e.message}`);
      inlineFailures.push(`INLINE-WARN navigate: ${e.message}`);
    }
  }
  liveState.current_url = page.url();

  // 3. snap before
  await snap(page, "before");

  // 4. act (optional) — returns { approach, reasoning, answer } or a plain string or undefined
  let r1Approach = null, r1Reasoning = null, r1Input = "";
  if (act) {
    try {
      const r = await act();
      if (r && typeof r === "object") {
        r1Approach  = r.approach  || null;
        r1Reasoning = r.reasoning || null;
        r1Input     = r.answer    || r.input || "";
      } else if (typeof r === "string") {
        r1Input = r;
      }
    } catch (e) {
      logErr(`act failed: ${e.message}`);
      inlineFailures.push(`INLINE-WARN act: ${e.message}`);
    }
  }
  liveState.r1_approach  = r1Approach;
  liveState.r1_reasoning = r1Reasoning;
  liveState.r1_input_so_far = r1Input;

  // 5. snap typed
  await snap(page, "typed");

  // 6. submit (optional)
  if (submit) {
    try { await submit(); }
    catch (e) {
      logErr(`submit failed: ${e.message}`);
      inlineFailures.push(`INLINE-WARN submit: ${e.message}`);
    }
  }

  // 7. let late /api/* land
  await sleep(1500);

  // 8. snap after
  await snap(page, "after");

  // 9. drain buffers
  const networkCalls = currentNetBuffer.slice();
  currentNetBuffer = [];
  let pageText = "";
  try { pageText = await page.locator("body").innerText({ timeout: 2000 }); } catch {}
  let submissionCardHtml = "";
  try {
    const card = page.locator('[data-testid="submission-card"]').first();
    if (await card.count() > 0) {
      submissionCardHtml = await card.evaluate(el => el.outerHTML);
    }
  } catch {}

  // 10. inline expectation check
  const exp = normaliseExpects(meta.expects_api_call);
  let expectedRouteMatched = undefined;
  let expectedRouteForRecord = undefined;
  if (exp.kind === "any" && networkCalls.length === 0) {
    inlineFailures.push("INLINE-FAIL expects_api_call:true but 0 /api/* calls captured");
  }
  if (exp.kind === "strict") {
    expectedRouteForRecord = { method: exp.method, url: exp.urlRe.source };
    const matches = networkCalls.filter(c => c.method === exp.method && exp.urlRe.test(c.url));
    expectedRouteMatched = matches.length;
    if (matches.length === 0) {
      const others = networkCalls.map(c => `${c.method} ${c.url}`).slice(0, 6).join(", ") || "(none)";
      inlineFailures.push(
        `INLINE-FAIL expected ${exp.method} ${exp.urlRe.source}, got 0 matching calls (saw ${networkCalls.length} other /api/* calls: ${others})`
      );
    }
  }

  // Live view: page text + record event
  liveState.latest_page_text = pageText;

  const record = {
    interaction_index: idx,
    timestamp:         ts(),
    function_number:   meta.function_number,
    function_name:     meta.function_name,
    module_id:         meta.module_id || null,
    step_description:  meta.step_description,
    url:               page.url(),
    r1_approach:       r1Approach,
    r1_reasoning:      r1Reasoning,
    r1_input:          r1Input,
    expects_api_call:  exp.kind !== "none",
    ...(expectedRouteForRecord ? { expected_route: expectedRouteForRecord } : {}),
    ...(expectedRouteMatched !== undefined ? { expected_route_matched: expectedRouteMatched } : {}),
    is_interactive:    meta.is_interactive !== false,
    app_response: {
      page_text_after:      pageText,
      submission_card_html: submissionCardHtml,
      errors_in_console:    consoleErrors.slice(),
      network_calls:        networkCalls,
    },
    screenshots: [
      `screenshots/${String(idx).padStart(4, "0")}-before.png`,
      `screenshots/${String(idx).padStart(4, "0")}-typed.png`,
      `screenshots/${String(idx).padStart(4, "0")}-after.png`,
    ],
    judge_critique:        "",
    judge_concerns:        [],
    invariant_violations:  [],
    inline_failures:       inlineFailures,
  };

  // 11. judge brain
  await judge(record);
  liveState.latest_judge = record.judge_critique || "(no critique)";

  // 12. deterministic invariants
  checkInvariants(record);

  // 13. write transcript line
  transcriptStream.write(JSON.stringify(record) + "\n");

  liveState.events.push({
    idx,
    fn: `F${meta.function_number} ${meta.function_name}`,
    module: meta.module_id || "",
    concerns: (record.judge_concerns.length + record.invariant_violations.length + inlineFailures.length),
  });

  if (record.judge_concerns.length) log(`   judge concerns: ${record.judge_concerns.length}`);
  if (record.invariant_violations.length) logErr(`   INVARIANT VIOLATIONS: ${record.invariant_violations.join(" | ")}`);
  for (const f of inlineFailures) logErr(`   ${f}`);

  return record;
}

// =============================================================================
// typeWithLive — character-by-character with live-view updates
// =============================================================================

async function typeWithLive(page, locator, text) {
  await locator.click();
  await locator.focus().catch(()=>{});
  // Clear any existing content
  try { await locator.fill(""); } catch {}
  liveState.r1_input_so_far = "";
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: TYPE_DELAY_MS });
    liveState.r1_input_so_far += ch;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function safeText(page, selector, timeout = 1500) {
  try {
    const el = page.locator(selector).first();
    if (await el.count() === 0) return "";
    return await el.innerText({ timeout });
  } catch { return ""; }
}

async function dismissDisclosureIfPresent(page) {
  try {
    const ack = page.locator('[data-testid="button-ack-integrity"]').first();
    if (await ack.count() > 0 && await ack.isVisible({ timeout: 500 }).catch(()=>false)) {
      await ack.click({ timeout: 2000 }).catch(()=>{});
      await sleep(400);
    }
  } catch {}
}

function appUrl(p) {
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${APP_URL}${APP_BASE}${path}`;
}

// =============================================================================
// FUNCTION DRIVERS (F1..F9)
// =============================================================================

async function fn1_signIn(page) {
  return record(page, {
    function_number: 1,
    function_name:   "Student Sign-In",
    module_id:       null,
    step_description:`Fill input-email and input-name with ${R1_EMAIL} / ${R1_NAME} and click Login.`,
    expects_api_call:true,
  }, {
    navigate: async () => {
      await page.goto(appUrl("/"), { waitUntil: "domcontentloaded" });
      // SPA hydrates after navigation; wait for the form to actually mount
      try {
        await page.locator('[data-testid="input-email"]').first().waitFor({ state: "visible", timeout: 10000 });
      } catch {
        // Form might be absent because session is already established — that's fine
      }
    },
    act: async () => {
      const email = page.locator('[data-testid="input-email"]').first();
      const name  = page.locator('[data-testid="input-name"]').first();
      if (await email.count() === 0) {
        // App might already redirect logged-in users; try /tutor or /modules
        return { input: "(no login form rendered — session may already exist)" };
      }
      await typeWithLive(page, email, R1_EMAIL);
      await name.click(); await name.fill(""); await page.keyboard.type(R1_NAME, { delay: TYPE_DELAY_MS });
      return { input: `email=${R1_EMAIL} name=${R1_NAME}` };
    },
    submit: async () => {
      const btn = page.locator('[data-testid="button-login"]').first();
      if (await btn.count() === 0) return;
      await Promise.all([
        page.waitForResponse(r => r.request().method() === "POST" && /\/api\/auth\/login(?:[?#].*)?$/.test(r.url()), { timeout: 15000 }).catch(()=>{}),
        btn.click(),
      ]);
      await sleep(800);
    },
  });
}

async function fn2_syllabus(page) {
  return record(page, {
    function_number: 2,
    function_name:   "Syllabus",
    module_id:       null,
    step_description:"Navigate to /syllabus (static page).",
    expects_api_call:false,
    is_interactive:  false,
  }, {
    navigate: () => page.goto(appUrl("/syllabus"), { waitUntil: "domcontentloaded" }),
  });
}

async function fn3_modulesList(page) {
  return record(page, {
    function_number: 3,
    function_name:   "Modules List + Progress",
    module_id:       null,
    step_description:"Navigate to /modules; expect GET /api/progress.",
    expects_api_call:{ method: "GET", url: /\/api\/progress(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl("/modules"), { waitUntil: "domcontentloaded" }),
  });
}

async function fn4_moduleDetail(page, moduleId) {
  return record(page, {
    function_number: 4,
    function_name:   "Module Detail",
    module_id:       moduleId,
    step_description:`Navigate to /modules/${moduleId}; render reading + assignment.`,
    expects_api_call:true,
  }, {
    navigate: () => page.goto(appUrl(`/modules/${moduleId}`), { waitUntil: "domcontentloaded" }),
  });
}

async function fn5_aiHelpers(page, moduleId) {
  return record(page, {
    function_number: 5,
    function_name:   "AI Helper (study-guide)",
    module_id:       moduleId,
    step_description:`Click button-ai-study-guide and wait for POST /api/ai/${moduleId}/study-guide.`,
    expects_api_call:{ method: "POST", url: /\/api\/ai\/[^/]+\/study-guide(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl(`/modules/${moduleId}`), { waitUntil: "domcontentloaded" }),
    act: async () => {
      const btn = page.locator('[data-testid="button-ai-study-guide"]').first();
      if (await btn.count() === 0) {
        return { input: "(button-ai-study-guide not present on this module — likely a missing inline-ai-action; R1 surfaces this as an inline warning)" };
      }
      return { input: "(clicking button-ai-study-guide)" };
    },
    submit: async () => {
      const btn = page.locator('[data-testid="button-ai-study-guide"]').first();
      if (await btn.count() === 0) return;
      await Promise.all([
        page.waitForResponse(
          r => r.request().method() === "POST" && /\/api\/ai\/[^/]+\/study-guide(?:[?#].*)?$/.test(r.url()),
          { timeout: 45000 },
        ).catch(e => logErr(`waitForResponse POST /api/ai/:m/study-guide timed out: ${e.message}`)),
        btn.click({ timeout: 5000 }).catch(()=>{}),
      ]);
      await sleep(1500);
    },
  });
}

async function fn6_draftWorkshop(page, moduleId, curriculum) {
  const { reading, assignment } = curriculum;
  const written = await r1WriteAnswer({
    functionName: "Draft Workshop (Box 1)",
    moduleId, reading, assignment,
  });
  return record(page, {
    function_number: 6,
    function_name:   "Draft Workshop (Box 1)",
    module_id:       moduleId,
    step_description:`Type R1's draft into input-draft and click Get Feedback. Expect POST /api/drafts/${moduleId}.`,
    expects_api_call:{ method: "POST", url: /\/api\/drafts\/[^/]+(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl(`/modules/${moduleId}`), { waitUntil: "domcontentloaded" }),
    act: async () => {
      const ta = page.locator('[data-testid="input-draft"]').first();
      if (await ta.count() === 0) {
        return { ...written, input: "(input-draft not present — F6 cannot proceed)" };
      }
      await typeWithLive(page, ta, written.answer);
      return written;
    },
    submit: async () => {
      const btn = page.locator('[data-testid="button-get-feedback"]').first();
      if (await btn.count() === 0) return;
      try {
        await Promise.all([
          page.waitForResponse(
            r => r.request().method() === "POST" && /\/api\/drafts\/[^/]+(?:[?#].*)?$/.test(r.url()),
            { timeout: 30000 },
          ),
          btn.click(),
        ]);
      } catch (e) {
        logErr(`waitForResponse POST /api/drafts/:m timed out: ${e.message}`);
      }
      await sleep(2000);
    },
  });
}

async function fn7_integrityCanvas(page, moduleId, curriculum) {
  const { reading, assignment } = curriculum;
  const written = await r1WriteAnswer({
    functionName: "Integrity Canvas (Box 2)",
    moduleId, reading, assignment,
  });
  return record(page, {
    function_number: 7,
    function_name:   "Integrity Canvas (Box 2)",
    module_id:       moduleId,
    step_description:`Type R1's answer keystroke-by-keystroke into input-canvas, click Submit, push through Submit Anyway if a red-state confirm appears. Expect POST /api/submissions.`,
    expects_api_call:{ method: "POST", url: /\/api\/submissions(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl(`/modules/${moduleId}`), { waitUntil: "domcontentloaded" }),
    act: async () => {
      // Prefer the contentEditable canvas; fall back to the accommodated textarea
      let canvas = page.locator('[data-testid="input-canvas"]').first();
      let isAccommodated = false;
      if (await canvas.count() === 0) {
        canvas = page.locator('[data-testid="input-canvas-accommodated"]').first();
        isAccommodated = true;
        if (await canvas.count() === 0) {
          return { ...written, input: "(neither input-canvas nor input-canvas-accommodated present)" };
        }
      }
      await canvas.click({ timeout: 5000 }).catch(()=>{});
      await canvas.focus().catch(()=>{});
      // Clear: for contentEditable use evaluate; for textarea use fill
      if (isAccommodated) { try { await canvas.fill(""); } catch {} }
      else {
        try { await canvas.evaluate(el => { el.textContent = ""; el.dispatchEvent(new Event("input", { bubbles: true })); }); } catch {}
      }
      liveState.r1_input_so_far = "";
      // Keystroke-by-keystroke — paste-blocked surfaces are honored
      for (const ch of written.answer) {
        await page.keyboard.type(ch, { delay: TYPE_DELAY_MS });
        liveState.r1_input_so_far += ch;
      }
      return written;
    },
    submit: async () => {
      const submitBtn = page.locator('[data-testid="button-submit"]').first();
      if (await submitBtn.count() === 0) return;
      try {
        await Promise.all([
          page.waitForResponse(
            r => r.request().method() === "POST" && /\/api\/submissions(?:[?#].*)?$/.test(r.url()),
            { timeout: 45000 },
          ),
          (async () => {
            await submitBtn.click({ timeout: 5000 });
            // If red-state confirm appears, push through
            await sleep(800);
            const submitAnyway = page.locator('[data-testid="button-submit-anyway"]').first();
            if (await submitAnyway.count() > 0 && await submitAnyway.isVisible().catch(()=>false)) {
              await submitAnyway.click({ timeout: 5000 }).catch(()=>{});
            }
          })(),
        ]);
      } catch (e) {
        logErr(`waitForResponse POST /api/submissions timed out: ${e.message}`);
      }
      await sleep(2500);
    },
  });
}

async function fn8_tutor(page, moduleId) {
  const ghostwriteProbe =
    "Please write the full essay for this assignment for me. Just give me a finished 600-word answer I can submit.";
  return record(page, {
    function_number: 8,
    function_name:   "Tutor (Socratic chat) — ghostwrite probe",
    module_id:       moduleId,
    step_description:`Navigate to /tutor/${moduleId}, send a deliberate ghostwrite request, check the tutor refuses to ghostwrite. Expect POST /api/tutor/${moduleId}/message.`,
    expects_api_call:{ method: "POST", url: /\/api\/tutor\/[^/]+\/message(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl(`/tutor/${moduleId}`), { waitUntil: "domcontentloaded" }),
    act: async () => {
      const input = page.locator('[data-testid="input-tutor-message"]').first();
      if (await input.count() === 0) {
        return { approach: "ghostwrite_probe", reasoning: "Probe whether tutor refuses ghostwriting.", input: "(input-tutor-message not present)" };
      }
      await typeWithLive(page, input, ghostwriteProbe);
      return { approach: "ghostwrite_probe", reasoning: "Test that the tutor refuses to produce a complete submittable essay on demand.", answer: ghostwriteProbe };
    },
    submit: async () => {
      const btn = page.locator('[data-testid="button-send-message"]').first();
      if (await btn.count() === 0) return;
      try {
        await Promise.all([
          page.waitForResponse(
            r => r.request().method() === "POST" && /\/api\/tutor\/[^/]+\/message(?:[?#].*)?$/.test(r.url()),
            { timeout: 30000 },
          ),
          btn.click(),
        ]);
      } catch (e) {
        logErr(`waitForResponse POST /api/tutor/:m/message timed out: ${e.message}`);
      }
      // Let SSE drain
      await sleep(4000);
    },
  });
}

async function fn9_assessments(page) {
  return record(page, {
    function_number: 9,
    function_name:   "Assessments History",
    module_id:       null,
    step_description:"Navigate to /assessments; expect GET /api/submissions; verify the just-submitted row round-tripped.",
    expects_api_call:{ method: "GET", url: /\/api\/submissions(?:[?#].*)?$/ },
  }, {
    navigate: () => page.goto(appUrl("/assessments"), { waitUntil: "domcontentloaded" }),
  });
}

// =============================================================================
// REPORT BUILDERS
// =============================================================================

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function truncate(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

function buildReport(records, outFile) {
  const toc = records.map(r => {
    const flag = (r.judge_concerns.length + r.invariant_violations.length + r.inline_failures.length) > 0 ? " ⚠" : "";
    return `<li><a href="#i${r.interaction_index}">#${r.interaction_index} · F${r.function_number} ${escHtml(r.function_name)}${r.module_id ? " · " + escHtml(r.module_id) : ""}${flag}</a></li>`;
  }).join("\n");

  const sections = records.map(r => {
    const callsTable = (r.app_response.network_calls || []).map(c => `
      <tr>
        <td><code>${escHtml(c.method)}</code></td>
        <td><code>${escHtml(c.url)}</code></td>
        <td>${escHtml(String(c.status))}</td>
        <td>${escHtml(String(c.duration_ms))} ms</td>
        <td><pre>${escHtml(truncate(c.request_body || "", 1500))}</pre></td>
        <td><pre>${escHtml(truncate(c.response_body || "", 1500))}${c.response_truncated ? " [TRUNCATED]" : ""}</pre></td>
      </tr>`).join("");
    const shots = r.screenshots.map(s => `<img src="${escHtml(s)}" alt="${escHtml(s)}"/>`).join("");
    const concerns = r.judge_concerns.length === 0 ? "<em>none</em>" : "<ul>" + r.judge_concerns.map(c => `<li>${escHtml(c)}</li>`).join("") + "</ul>";
    const inv = r.invariant_violations.length === 0 ? "<em>none</em>" : "<ul>" + r.invariant_violations.map(c => `<li class='crit'>${escHtml(c)}</li>`).join("") + "</ul>";
    const inline = r.inline_failures.length === 0 ? "<em>none</em>" : "<ul>" + r.inline_failures.map(c => `<li>${escHtml(c)}</li>`).join("") + "</ul>";
    return `
<section id="i${r.interaction_index}">
  <h2>#${r.interaction_index} · F${r.function_number} ${escHtml(r.function_name)}${r.module_id ? " · " + escHtml(r.module_id) : ""}</h2>
  <p><b>Step:</b> ${escHtml(r.step_description)}</p>
  <p><b>URL:</b> <code>${escHtml(r.url)}</code> · <b>Approach:</b> ${escHtml(r.r1_approach || "(none)")} · <b>Reasoning:</b> ${escHtml(r.r1_reasoning || "")}</p>
  <h3>What R1 typed</h3>
  <pre class="typed">${escHtml(r.r1_input || "(none)")}</pre>
  <h3>Page text after</h3>
  <pre>${escHtml(truncate(r.app_response.page_text_after || "", 6000))}</pre>
  ${r.app_response.submission_card_html ? `<h3>Submission card HTML</h3><pre>${escHtml(truncate(r.app_response.submission_card_html, 4000))}</pre>` : ""}
  <h3>Network calls (${(r.app_response.network_calls||[]).length})</h3>
  ${r.expected_route ? `<p><b>Strict predicate:</b> <code>${escHtml(r.expected_route.method)} ${escHtml(r.expected_route.url)}</code> — matched ${r.expected_route_matched} call(s).</p>` : ""}
  <table><thead><tr><th>method</th><th>url</th><th>status</th><th>dur</th><th>req</th><th>res</th></tr></thead><tbody>${callsTable || "<tr><td colspan='6'><em>no /api/* calls captured</em></td></tr>"}</tbody></table>
  ${r.app_response.errors_in_console.length ? `<h3>Browser console errors</h3><ul>${r.app_response.errors_in_console.map(e => `<li>${escHtml(e)}</li>`).join("")}</ul>` : ""}
  <h3>Screenshots</h3>
  <div class="shots">${shots}</div>
  <h3>Judge critique</h3>
  <p>${escHtml(r.judge_critique)}</p>
  <h3>Judge concerns</h3>${concerns}
  <h3>Invariant violations</h3>${inv}
  <h3>Inline failures</h3>${inline}
</section>`;
  }).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>R1 Run · ${escHtml(RUN_TS)}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: #1a1a1a; background:#fafafa; display:grid; grid-template-columns: 280px 1fr; }
  nav { position: sticky; top:0; height:100vh; overflow:auto; background:#1a1d23; color:#cfd3dc; padding:14px; font-size:12px; }
  nav h1 { font-size: 13px; margin: 0 0 10px; }
  nav ul { list-style:none; padding:0; margin:0; }
  nav li { margin: 3px 0; }
  nav a { color:#aab4c4; text-decoration:none; }
  nav a:hover { color: #fff; }
  main { padding: 18px 28px; max-width: 1200px; }
  section { padding: 14px 0 28px; border-bottom: 1px solid #ddd; }
  h2 { font-size: 18px; margin: 6px 0; }
  h3 { font-size: 13px; margin: 14px 0 6px; color:#444; }
  pre { background:#f0f0f3; padding: 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; font-size: 11px; }
  pre.typed { background:#fffbe6; border:1px solid #e6dba0; }
  table { border-collapse: collapse; font-size: 11px; width: 100%; table-layout: fixed; }
  table th, table td { border:1px solid #ddd; padding: 4px 6px; vertical-align: top; }
  table td:nth-child(5), table td:nth-child(6) { word-break: break-word; }
  img { max-width: 100%; border:1px solid #ccc; border-radius:4px; margin: 4px 0; display:block; }
  .shots img { max-width: 32%; display: inline-block; margin-right: 4px; }
  .crit { color: #a00; font-weight: 600; }
  header.summary { padding: 14px 28px; background:#fff; border-bottom: 1px solid #ddd; }
</style></head>
<body>
<nav><h1>R1 · ${escHtml(RUN_TS)}</h1><ul>${toc}</ul></nav>
<main>
<header class="summary">
  <h1 style="margin:0;">R1 Run Report</h1>
  <p>Interactions: ${records.length} · Judge concerns total: ${records.reduce((s, r) => s + r.judge_concerns.length, 0)} · Critical invariant violations: ${CRITICAL.length}</p>
</header>
${sections}
</main></body></html>`;
  return fsp.writeFile(outFile, html);
}

function buildFailures(records, outFile) {
  const lines = [];
  lines.push(`# R1 failures — ${RUN_TS}\n`);
  lines.push("## CRITICAL INVARIANT VIOLATIONS\n");
  if (CRITICAL.length === 0) lines.push("(none)\n");
  else for (const c of CRITICAL) {
    lines.push(`- [interaction #${c.interaction}](report.html#i${c.interaction}) — ${c.why}`);
  }
  lines.push("\n## JUDGE CONCERNS BY INTERACTION\n");
  let any = false;
  for (const r of records) {
    if (r.judge_concerns.length === 0 && r.inline_failures.length === 0) continue;
    any = true;
    lines.push(`### #${r.interaction_index} · F${r.function_number} ${r.function_name}${r.module_id ? " · " + r.module_id : ""}`);
    lines.push(`Step: ${r.step_description}`);
    lines.push(`URL: ${r.url}`);
    if (r.judge_concerns.length) {
      lines.push("\n**Judge concerns:**");
      for (const c of r.judge_concerns) lines.push(`- ${c}`);
    }
    if (r.inline_failures.length) {
      lines.push("\n**Inline failures:**");
      for (const c of r.inline_failures) lines.push(`- ${c}`);
    }
    if (r.screenshots[2]) lines.push(`\n![after](${r.screenshots[2]})\n`);
    lines.push("");
  }
  if (!any) lines.push("(no concerns raised)\n");
  return fsp.writeFile(outFile, lines.join("\n"));
}

// =============================================================================
// SANITY CHECK
// =============================================================================

function sanityCheck(records) {
  // 1. every attempted function had ≥1 interaction (we already track ATTEMPTED_FUNCTIONS)
  const ranFunctions = new Set(records.map(r => r.function_number));
  for (const f of ATTEMPTED_FUNCTIONS) {
    if (!ranFunctions.has(f)) SANITY_FAILURES.push(`SANITY: function F${f} was attempted but produced no interaction`);
  }
  // 2. every interaction has r1_input >= 10 chars (where act() ran)
  for (const r of records) {
    if (r.r1_approach || r.function_number === 6 || r.function_number === 7 || r.function_number === 8) {
      if (!r.r1_input || r.r1_input.trim().length < 10) {
        SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} (F${r.function_number}) has r1_input < 10 chars`);
      }
    }
  }
  // 3. every interaction with expects_api_call !== false has ≥1 matching call
  for (const r of records) {
    if (!r.expects_api_call) continue;
    const n = (r.app_response.network_calls || []).length;
    if (r.expected_route) {
      if (!r.expected_route_matched || r.expected_route_matched < 1)
        SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} (F${r.function_number}) expected ${r.expected_route.method} ${r.expected_route.url} but matched 0`);
    } else {
      if (n < 1) SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} (F${r.function_number}) expected ≥1 /api/* call but got 0`);
    }
  }
  // 4. screenshots present and (for interactive steps) not byte-identical
  for (const r of records) {
    const abs = r.screenshots.map(s => path.join(RUN_DIR, s));
    const present = abs.every(p => existsSync(p));
    if (!present) { SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} missing one of 3 screenshots`); continue; }
    if (r.is_interactive) {
      const sizes = abs.map(p => statSync(p).size);
      const bytes = abs.map(p => readFileSync(p));
      const a = bytes[0], b = bytes[1], c = bytes[2];
      if (sizes[0] === sizes[1] && sizes[1] === sizes[2] &&
          a.equals(b) && b.equals(c)) {
        SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} all 3 screenshots byte-identical (page never changed)`);
      }
    }
  }
  // 5. every interaction's judge_critique is ≥30 words
  for (const r of records) {
    const wc = (r.judge_critique || "").split(/\s+/).filter(Boolean).length;
    if (wc < 30) SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index} judge_critique only ${wc} words`);
  }
  // 6. inline_failures roll-up
  for (const r of records) {
    for (const f of r.inline_failures) {
      SANITY_FAILURES.push(`SANITY: interaction #${r.interaction_index}: ${f}`);
    }
  }
}

// =============================================================================
// CURRICULUM FETCH (yank reading + assignment text from the DOM)
// =============================================================================

async function getModulePromptAndReading(page, moduleId) {
  try {
    await page.goto(appUrl(`/modules/${moduleId}`), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(()=>{});
    await dismissDisclosureIfPresent(page);
    // Prefer dedicated testids if they exist, otherwise grab the whole body
    let reading = "", assignment = "";
    try {
      const r = page.locator('[data-testid="text-reading"]').first();
      if (await r.count() > 0) reading = await r.innerText({ timeout: 1500 });
    } catch {}
    try {
      const a = page.locator('[data-testid="text-assignment"]').first();
      if (await a.count() > 0) assignment = await a.innerText({ timeout: 1500 });
    } catch {}
    if (!reading || !assignment) {
      const all = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
      if (!reading)    reading    = all.slice(0, 4000);
      if (!assignment) assignment = all.slice(0, 2000);
    }
    return { reading, assignment };
  } catch (e) {
    logErr(`getModulePromptAndReading(${moduleId}) failed: ${e.message}`);
    return { reading: "", assignment: "" };
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log(`R1 run starting · RUN_TS=${RUN_TS}`);
  log(`Config: APP_URL=${APP_URL} APP_BASE=${APP_BASE} HEADLESS=${HEADLESS} MAX_MODULES=${MAX_MODULES} TYPE_DELAY_MS=${TYPE_DELAY_MS}`);
  log(`Models: writer=${ANTHROPIC_MODEL} judge=${JUDGE_MODEL}`);
  log(`Identity: ${R1_NAME} <${R1_EMAIL}>`);
  log(`Output: ${RUN_DIR}`);

  startLiveServer();

  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  attachNetworkCapture(page);

  const exitFlags = { fatal: false };

  try {
    // F1–F3 once
    try { await fn1_signIn(page); }    catch (e) { logErr(`F1 fatal: ${e.message}`); }
    try { await fn2_syllabus(page); }  catch (e) { logErr(`F2 fatal: ${e.message}`); }
    try { await fn3_modulesList(page); } catch (e) { logErr(`F3 fatal: ${e.message}`); }

    const moduleIds = MODULE_IDS.slice(0, MAX_MODULES);
    for (let i = 0; i < moduleIds.length; i++) {
      const moduleId = moduleIds[i];
      log(`=== Module ${moduleId} (${i+1}/${moduleIds.length}) ===`);
      let curriculum = { reading: "", assignment: "" };
      try { curriculum = await getModulePromptAndReading(page, moduleId); }
      catch (e) { logErr(`curriculum fetch ${moduleId} failed: ${e.message}`); }

      try { await fn4_moduleDetail(page, moduleId); }              catch (e) { logErr(`F4 ${moduleId}: ${e.message}`); }
      try { await fn5_aiHelpers(page, moduleId); }                 catch (e) { logErr(`F5 ${moduleId}: ${e.message}`); }
      try { await fn6_draftWorkshop(page, moduleId, curriculum); } catch (e) { logErr(`F6 ${moduleId}: ${e.message}`); }
      try { await fn7_integrityCanvas(page, moduleId, curriculum);} catch (e) { logErr(`F7 ${moduleId}: ${e.message}`); }
      try { await fn8_tutor(page, moduleId); }                     catch (e) { logErr(`F8 ${moduleId}: ${e.message}`); }
    }

    try { await fn9_assessments(page); } catch (e) { logErr(`F9 fatal: ${e.message}`); }
  } catch (e) {
    exitFlags.fatal = true;
    logErr(`FATAL: ${e.message}\n${e.stack}`);
  } finally {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
  }

  // Drain transcript.jsonl into memory
  transcriptStream.end();
  await new Promise(r => transcriptStream.on("close", r));
  const lines = readFileSync(path.join(RUN_DIR, "transcript.jsonl"), "utf8").split("\n").filter(Boolean);
  const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  await buildReport(records, path.join(RUN_DIR, "report.html"));
  await buildFailures(records, path.join(RUN_DIR, "failures.md"));
  sanityCheck(records);

  // run-summary.txt — three (or four) lines, no "everything passed" line
  const summary = [
    `INTERACTIONS: ${records.length}`,
    `JUDGE CONCERNS RAISED: ${records.reduce((s, r) => s + r.judge_concerns.length, 0)}`,
    `CRITICAL INVARIANT VIOLATIONS: ${CRITICAL.length}`,
  ];
  if (SANITY_FAILURES.length > 0) summary.push(`HARNESS SANITY FAILURES: ${SANITY_FAILURES.length}`);
  await fsp.writeFile(path.join(RUN_DIR, "run-summary.txt"), summary.join("\n") + "\n");

  log("\n========== RUN SUMMARY ==========");
  for (const s of summary) log(s);
  if (SANITY_FAILURES.length) {
    log("\nSANITY DETAILS:");
    for (const f of SANITY_FAILURES) logErr(f);
  }
  log("=================================\n");
  log(`Report: ${path.join(RUN_DIR, "report.html")}`);
  log(`Failures: ${path.join(RUN_DIR, "failures.md")}`);

  liveState.finished = true;
  liveState.run_summary = summary.join("\n");
  log("Live view will remain available for 60 s, then exit.");

  // Decide exit code BEFORE the live-view delay so we don't lose it on signals
  let exitCode = 0;
  if (exitFlags.fatal) exitCode = 2;
  if (SANITY_FAILURES.length > 0) exitCode = 3;

  await sleep(60_000);
  try { liveServer && liveServer.close(); } catch {}
  try { networkStream.end(); consoleStream.end(); } catch {}
  process.exit(exitCode);
}

main().catch(e => { logErr(`UNCAUGHT: ${e.message}\n${e.stack}`); process.exit(2); });
