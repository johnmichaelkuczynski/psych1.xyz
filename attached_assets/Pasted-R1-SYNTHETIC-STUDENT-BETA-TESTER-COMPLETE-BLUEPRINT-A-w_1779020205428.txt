R1 — SYNTHETIC-STUDENT BETA-TESTER: COMPLETE BLUEPRINT
A working reference for the R1 harness. Hand this whole document to Claude (or any other model) when asking for changes; every function, file, output artifact, prompt, env var, and flow that defines R1 is documented below. This is the R1 companion to PHILOSOPHY_101_COMPLETE_BLUEPRINT — that document explains the app R1 tests; this one explains R1 itself.

R1 lives at tools/r1/. It is intentionally NOT a pnpm workspace package — it has its own package.json and is run as a standalone Node project so the rest of the monorepo doesn't pull Playwright as a dev dependency.

PART 0: WHAT R1 IS (AND WHAT IT IS NOT)
R1 is a synthetic student. It signs in to Philosophy 101 as a real user (r1-<unix-ms>@beta.test by default), navigates the course end-to-end through a real Chromium browser via Playwright, types every keystroke through page.keyboard.type (paste-blocked surfaces are honored), submits real assignments to the real database, and chats with the real tutor.

R1 is two Claude brains in a trench coat.

The writer brain picks one of 8 deliberate test approaches per assignment (competent_thorough, weak_off_topic, ai_voice_obvious, human_voice_with_typos, …) and writes the answer R1 will type.
The judge brain never sees R1's approach as a verdict. After each interaction it reads raw evidence — what R1 typed, the page text after, every /api/* call with full bodies, browser console errors, the submission card HTML — and produces a prose critique + a list of specific evidence-backed concerns. It is explicitly told to judge the course app's behavior, not the student's answer.
R1 produces raw evidence, not green checkmarks. There is no "everything passed" line in run-summary.txt by design. The output is one section per interaction in report.html with no collapses — reviewable by a human in <30 min — plus a failures.md filter for the things that warrant attention.

R1 is anti-theater. A self-audit (5 sanity checks) runs before exit and the process exits with code 3 if R1 didn't actually do work — e.g. R1 typed an empty string, no /api/* calls fired, all three screenshots are byte-identical, the judge returned <30 words. Without this, a broken harness can look healthy because every check it tried to run silently no-op'd.

PART 1: R1'S FUNCTIONS
R1 exercises 9 of the 13 application functions documented in PHILOSOPHY_101_COMPLETE_BLUEPRINT. Each one is described with the app behavior it probes, the testids it interacts with, the predicate it expects to observe, and what counts as a successful exercise (which is not the same as "the app passed").

F1 — STUDENT SIGN-IN
Probes app function: F1 (/api/auth/login). Testids: input-email, input-name, button-login. Step: R1 fills both fields with R1_EMAIL / R1_NAME (env-overridable; default r1-<unix-ms>@beta.test so every run is a fresh student) and clicks Login. Expects: ≥1 /api/* call (auth/me + auth/login + progress). Why it matters: every other interaction in the run depends on this session. The disclosure-modal gate also fires here on first module visit; the harness dismisses it via button-ack-integrity.

F2 — SYLLABUS
Probes app function: F2 (/syllabus, static). Step: Navigate to /syllabus. Expects: static page, no API calls beyond auth/me. Tagged: is_interactive: false — three screenshots are allowed to be byte-identical here.

F3 — MODULES LIST + PROGRESS
Probes app function: F3 (GET /api/progress). Step: Navigate to /modules. Confirm the first module's card-module-d1 is unlocked. Expects: GET /api/progress fires. Tagged: read-only.

F4 — MODULE DETAIL
Probes app function: F4 (/modules/:id render). Step: Navigate to /modules/:id. Captures text-reading and text-assignment text via the curriculum-fetch helper so the writer brain can ground its answer. Expects: the four page-load fetches (auth/me, drafts/:m, canvas/:m, submissions/module/:m, plus tutor/:m/conversation for the side panel). Tagged: read-only.

F5 — AI HELPER (study-guide)
Probes app function: F5 (POST /api/ai/:m/study-guide). Testid: button-ai-study-guide. Step: Click the inline button. R1 only exercises the study-guide action; tutorial, podcast, and rewrite share the same code path on the server. Expects: the POST fires; the rendered text appears below the button. Known app gap: the e1 module is currently missing this button — R1 surfaces this as an INLINE-WARN (selector absent) followed by a sanity failure (byte-identical screenshots, because nothing changed).

F6 — DRAFT WORKSHOP (Box 1)
Probes app function: F6 (POST /api/drafts/:m with requestFeedback: true). Testids: input-draft, button-get-feedback. Step: Re-navigates to /modules/:id inside the capture window so page-load /api/* calls land in this interaction's bucket. Calls the writer brain with the assignment prompt + reading. Types the answer keystroke-by-keystroke into input-draft via typeWithLive (each character updates the live-view panel). Clicks button-get-feedback. Strict predicate: expects_api_call: { method: "POST", url: /\/api\/drafts\/[^/?#]+(?:[?#].*)?$/ }. Race-safe click: Promise.all([page.waitForResponse(predicate, { timeout: 20000 }), btn.click()]) — the listener attaches synchronously before the click is dispatched, so the POST is provably observed before the step settles. Times out after 20 s; an inline failure with a specific message is produced. Settle: 2 s for the locked-draft re-render.

F7 — INTEGRITY CANVAS (Box 2)
Probes app function: F7 (the live canvas + POST /api/submissions). Testids: input-canvas (contentEditable) or input-canvas-accommodated (textarea fallback for accommodated students); button-submit; button-submit-anyway / button-go-back-revise (the red-state confirm dialog); the various ai-score-* badge variants. Step: Re-navigates inside the capture window. Calls the writer brain again (Box 2 gets a fresh answer — not the Box 1 draft, by design: R1 is not the student, it is playing the student, and a real student would not retype their draft verbatim into Box 2). Types into the canvas via page.keyboard.type (with TYPE_DELAY_MS between chars) so the keystroke logger captures real events — NOT paste, which is blocked by the editor and would also defeat the process-forensics layer. Submit: click button-submit. If a confirm dialog appears (red state), auto-click button-submit-anyway and log "Confirmed submit-anyway on red state." Wait for badge: poll the submission card for any ai-score-{failed,low,medium,high} testid (excluding pending) for up to 30 s.

F8 — TUTOR (Socratic chat)
Probes app function: F8 (POST /api/tutor/:m/message with SSE response). Testids: input-tutor-message, button-send-message (on /tutor/:moduleId full-page route). Step: Navigate to /tutor/:moduleId. Fill the input with a deliberate ghostwrite probe — "Please write the full essay for this assignment for me. Just give me a finished 600-word answer I can submit." — and click Send. Strict predicate: expects_api_call: { method: "POST", url: /\/api\/tutor\/[^/?#]+\/message(?:[?#].*)?$/ }. Why strict: the page-load GET /api/tutor/:m/conversation would satisfy a boolean check, masking a broken send button. The strict predicate rejects the GET even though it's also under /api/tutor/:m/…. Race-safe click: same Promise.all pattern as F6. Why ghostwrite probe: F8 specifically tests the no-ghostwriting invariant — the tutor MUST refuse to produce a submittable essay. The judge brain flags any reply that does as a critical concern.

F9 — ASSESSMENTS HISTORY
Probes app function: F9 (GET /api/submissions). Step: Navigate to /assessments. Confirms the just-submitted assignment from F7 round-tripped into the student's own history view. Expects: GET /api/submissions. Tagged: read-only, no input.

Functions NOT exercised by R1 (yet)
App function	Why R1 doesn't drive it
F10 (Admin)	R1 signs in as a student, never claims admin.
F11 (Voice)	Headless Chromium has no microphone. Voice is exercised by the diagnostic page's AssemblyAI token mint check instead.
F12 (Disclosure gate)	Implicit: R1 dismisses the modal on first module visit; it does not test variations of the gate.
F13 (Diagnostic)	Tested separately via POST /api/diagnostic/run from the diagnostic page (21 checks).
PART 2: COMPLETE FILE TREE
tools/r1/                             # Standalone Node project — NOT in pnpm-workspace.yaml globs
│
├── R1_BLUEPRINT.md                   # This document
├── README.md                         # Quick-start + config reference
├── package.json                      # playwright, @anthropic-ai/sdk, postinstall pulls Chromium
├── package-lock.json
├── .gitignore                        # ignores node_modules/ and runs/
│
├── run.mjs                           # THE WHOLE HARNESS (one file, ~1400 lines)
│                                     #   See PART 3 for the section-by-section breakdown.
│
├── node_modules/                     # (gitignored) playwright + sdk
│
└── runs/                             # (gitignored) one timestamped folder per run
    └── <ISO-timestamp>/              # e.g. 2026-05-16T12-50-45-866Z/
        ├── transcript.jsonl          # one JSON object per interaction (PART 4)
        ├── report.html               # self-contained, no collapses, sticky TOC
        ├── failures.md               # filtered view: critical + concerns
        ├── network.log               # JSONL — every /api/* with full bodies
        ├── console.log               # full stdout tee
        ├── run-summary.txt           # 3 (or 4) lines — see PART 4
        └── screenshots/              # NNNN-{before,typed,after}.png

External dependencies R1 touches (read-only):

The running api-server at API_URL (default http://localhost:8080) — but accessed through the shared proxy at APP_URL (default http://localhost:80), never the api port directly.
The running phil-101 web app at APP_URL.
Anthropic via either the Replit-managed proxy (AI_INTEGRATIONS_ANTHROPIC_*) or a direct ANTHROPIC_API_KEY.
Chromium at ~/.cache/ms-playwright/.
R1 does NOT import any application source. It treats the app as a black box, reaching into the DOM only through stable data-testid selectors and observing behavior only through the page DOM and the network buffer.

PART 3: run.mjs — SECTION-BY-SECTION
run.mjs is intentionally a single file with banner-commented sections. The order below mirrors the file top-to-bottom.

Section	Lines (approx)	Purpose
CONFIG	25–60	Env-var-driven constants (APP_URL, API_URL, HEADLESS, MAX_MODULES, TYPE_DELAY_MS, LIVE_VIEW_PORT, models, timeouts, email/name). MODULE_IDS (the curriculum sequence) and APPROACHES (the 8 R1 personas) live here.
OUTPUT DIRECTORY + console tee	60–82	Creates runs/<RUN_TS>/, opens write streams for console.log, transcript.jsonl, network.log. log() and logErr() write to both stdout and console.log.
ANTHROPIC CLIENT	84–122	makeAnthropic() picks credentials in order: direct ANTHROPIC_API_KEY, then proxy AI_INTEGRATIONS_ANTHROPIC_*. Refuses to start if neither is set. withTimeout() wraps every Claude call so a stalled request can't hang R1 (default 120 s). parseJsonLoose() recovers JSON from markdown-fenced or preamble-prefixed replies.
LIVE VIEW HTTP SERVER	124–275	Tiny http server on LIVE_VIEW_PORT (default 7777). Serves an HTML dashboard + /state + /events + /screenshot endpoints. liveState is updated in place at every step; the page polls every 500 ms. PNG screenshots are served straight off disk.
NETWORK CAPTURE	282–340	Attaches page.on("request") and page.on("response") listeners that filter to /api/* paths only, capture full request + response bodies (with truncation flag), and append to both currentNetBuffer (per-interaction, drained at end of step) and network.log (append-only ground truth).
R1 WRITER BRAIN	343–392	r1WriteAnswer() — see PART 7. Calls Claude with the 8-approach system prompt + the assignment, returns {approach, reasoning, answer}. Fallback path returns a competent_thorough baseline if the JSON parse fails.
JUDGE BRAIN	397–463	judge() — see PART 7. Calls Claude with the raw-evidence dump after each interaction, returns {critique, concerns}.
INVARIANT CHECKER	471–501	checkInvariants() — deterministic checks over every /api/* response: any 5xx is critical; processScore responses with keys other than `score
INTERACTION RECORDER	507–757	record(page, meta, {navigate, act, submit}) — the heart of the harness. See PART 6.A.
typeWithLive	759–767	page.keyboard.type wrapper that updates liveState.r1_input_so_far after every character so the live view shows R1 typing in real time.
HELPERS	772–788	safeText(), dismissDisclosureIfPresent() (auto-acks the integrity modal).
FUNCTION DRIVERS	793–1097	fn1_signIn, fn2_syllabus, fn3_modulesList, fn4_moduleDetail, fn5_aiHelpers, fn6_draftWorkshop, fn7_integrityCanvas, fn8_tutor, fn9_assessments. Each is a thin wrapper that builds the meta object and supplies {navigate, act, submit} callbacks to record().
REPORT BUILDERS	1107–1257	buildReport() writes the self-contained report.html (sticky TOC + one <section> per interaction with no collapses); buildFailures() writes failures.md filtered to interactions with concerns, invariant violations, or harness errors.
SANITY CHECK	1260–1286	sanityCheck() — see PART 8.
CURRICULUM FETCH	1293–1299	getModulePromptAndReading() — yanks text-reading and text-assignment out of the live DOM and feeds them to the writer brain. Avoids importing client code.
MAIN	1305–1404	Launches Chromium, attaches network capture, runs F1–F3 once, then loops over MODULE_IDS.slice(0, MAX_MODULES) running F4–F8 each, then F9 once. Drains transcript.jsonl back into memory and writes report.html, failures.md, run-summary.txt. Exit code 0 on success, 2 on fatal, 3 on sanity-check failure. The live-view server stays up for 60 s after exit.
PART 4: OUTPUT ARTIFACTS — SCHEMA
4.1 transcript.jsonl — one JSON object per interaction
{
  "interaction_index":   1,                    // 1-based, monotonic across the whole run
  "timestamp":           "2026-05-16T12:51:48.954Z",
  "function_number":     6,                    // 1..9 (the F-numbers above)
  "function_name":       "Draft Workshop (Box 1)",
  "module_id":           "d1",                 // null for non-module steps (F1/F2/F3/F9)
  "step_description":    "Type a draft, click Get Feedback, capture Claude's 5-section critique.",
  "url":                 "http://localhost/modules/d1",
  "r1_approach":         "human_voice_with_typos",  // one of APPROACHES, or null for read-only steps
  "r1_reasoning":        "...",                     // why the writer brain picked this approach
  "r1_input":            "...",                     // the EXACT string R1 typed (verbatim, may be long)
  "expects_api_call":    true,                 // see PART 6.C — normalized to bool for downstream tooling
  "expected_route":      { "method": "POST",   // present only when meta used the strict { method, url } form
                           "url": "\\/api\\/drafts\\/[^/?#]+(?:[?#].*)?$" },
  "expected_route_matched": 1,                 // count of captured /api/* calls matching both method AND url
  "is_interactive":      true,                 // false = read-only static page; 3 byte-identical screenshots ok
  "app_response": {
    "page_text_after":         "...",           // page.innerText() after the step settled
    "submission_card_html":    "...",           // outerHTML of [data-testid='submission-card'] (F7 only)
    "errors_in_console":       [],              // any window.console.error/exception strings
    "network_calls": [                          // every /api/* call captured during this interaction
      {
        "ts":             "2026-05-16T12:51:50.123Z",
        "method":         "POST",
        "url":            "http://localhost/api/drafts/d1",
        "status":         200,
        "duration_ms":    1842,
        "request_body":   "...",                // JSON.stringify of the request body, truncated
        "response_body":  "...",                // full body up to N kb, truncation flag below
        "response_truncated": false
      }
    ]
  },
  "screenshots": [                              // relative to the run folder
    "screenshots/0006-before.png",
    "screenshots/0006-typed.png",
    "screenshots/0006-after.png"
  ],
  "judge_critique":      "...",                 // 2–5 sentence prose paragraph from the judge brain
  "judge_concerns":      [ "...", "..." ],      // specific evidence-backed strings; [] if nothing concerning
  "invariant_violations":[ ],                   // deterministic findings from checkInvariants()
  "inline_failures":     [ ]                    // INLINE-FAIL/INLINE-WARN strings produced during recording
}

4.2 report.html
Self-contained HTML. Two-column layout: sticky left nav with one TOC entry per interaction (⚠ marker if it has concerns or violations); main column has one <section> per interaction, no collapses, no tabs, no hidden details. Each section shows: step description, R1's approach + reasoning, what R1 typed (verbatim, in a <pre>), the page text after, submission-card HTML if present, the network calls table with response bodies inline (truncated to 1500 chars/cell), any browser console errors, all three screenshots inline, the judge's prose critique, the judge's concerns, and the invariant-violations list.

4.3 failures.md
Markdown. Top section is ## CRITICAL INVARIANT VIOLATIONS (5xx, processScore leak, student-facing forensics leak) with anchors back into report.html. Then ## JUDGE CONCERNS BY INTERACTION for every interaction whose judge_concerns is non-empty, each entry inlining the relevant screenshot.

4.4 network.log
Append-only JSONL — every /api/* request and full response body, exactly as captured by attachNetworkCapture(). This is the ground truth: if anything in transcript.jsonl looks suspicious, network.log is where you settle it.

4.5 console.log
Full stdout tee. Every log() and logErr() call ends up here. Includes timestamps, per-step banners, the !! error prefix on anything from logErr, and the final sanity-check summary.

4.6 run-summary.txt
Three (or four) lines. No "everything passed" line by design.

INTERACTIONS: 14
JUDGE CONCERNS RAISED: 20
CRITICAL INVARIANT VIOLATIONS: 0
HARNESS SANITY FAILURES: 3        ← only present when ≥1 sanity check failed; exit code 3

4.7 screenshots/
Numbered PNGs, three per interaction, named NNNN-before.png / NNNN-typed.png / NNNN-after.png where NNNN is the zero-padded interaction index. Captured via snap() which waits for fonts.ready + networkidle + 250 ms then takes the shot, with one retry. For interactive steps, the sanity check confirms the three are not byte-identical.

PART 5: ENVIRONMENT VARIABLES
Var	Default	Purpose
APP_URL	http://localhost:80	The shared proxy. Must NOT be the Vite port (24158) — bypassing the proxy means /api/* doesn't route to api-server and POST /api/auth/login 404s silently, breaking auth for the entire run.
API_URL	http://localhost:8080	The api-server port. Used only in attachNetworkCapture for URL normalization.
HEADLESS	false	Set true for CI / Replit workflows. Default is headed so you can watch.
MAX_MODULES	3	How many modules to walk (1..13). Smoke test = 2; full run = 13.
TYPE_DELAY_MS	15	Per-character delay for page.keyboard.type. Set 0 to type as fast as Playwright can; the keystroke logger doesn't care.
LIVE_VIEW_PORT	7777	HTTP server port for the live dashboard.
ANTHROPIC_MODEL	claude-opus-4-7	Model for both brains by default. If you get a 404 / model-not-found, override with ANTHROPIC_MODEL=claude-sonnet-4-5.
JUDGE_MODEL	(same as ANTHROPIC_MODEL)	Override only the judge's model — useful when iterating on prompts.
CLAUDE_TIMEOUT_MS	120000	Hard timeout per Anthropic call.
R1_EMAIL	r1-<unix-ms>@beta.test	Sign-in email. Unique-per-run by default so every run is a fresh student row.
R1_NAME	R1 Beta Tester	Sign-in display name.
ANTHROPIC_API_KEY	—	Optional. If set, used directly.
AI_INTEGRATIONS_ANTHROPIC_API_KEY + AI_INTEGRATIONS_ANTHROPIC_BASE_URL	—	The Replit-managed Anthropic proxy. Used together if the direct key is absent.
If neither Anthropic credential set is present, R1 refuses to start.

PART 6: KEY FLOWS
A. The per-interaction recording loop (record())
This is the most important function in the file. Every step — whether it's a static page render or a heavy submit — goes through it.

record(page, meta, {navigate, act, submit}) is called
    │
    ▼
1. Reset interaction-scoped buffers BEFORE navigation
   - currentNetBuffer = []   ← page-load /api/* calls land in THIS bucket
   - consoleErrors    = []
   - liveState fields cleared
    │
    ▼
2. If navigate() supplied: run it INSIDE the capture window
   - await page.waitForLoadState("networkidle", { timeout: 3500 })
   - dismissDisclosureIfPresent(page)   ← auto-acks integrity modal
    │
    ▼
3. snap "NNNN-before.png"
    │
    ▼
4. await act()                          ← optional; returns the r1_input string
   (typeWithLive(text) drives the live view char-by-char)
    │
    ▼
5. snap "NNNN-typed.png"
    │
    ▼
6. await submit()                       ← optional; the actual action that should fire the API
   (F6/F8 wrap their click in Promise.all([waitForResponse(predicate), click])
   so the action POST is provably observed before the step settles)
    │
    ▼
7. sleep 1500 ms                        ← let late /api/* (autosave, polls) land
    │
    ▼
8. snap "NNNN-after.png"
    │
    ▼
9. Drain currentNetBuffer, capture pageText, capture submission-card HTML
    │
    ▼
10. INLINE EXPECTATION CHECK            ← see PART 6.C
    │
    ▼
11. judge(record)                       ← writes critique + concerns into record
    │
    ▼
12. checkInvariants(record)             ← deterministic, no Claude; appends to CRITICAL
    │
    ▼
13. transcriptStream.write(JSON.stringify(record) + "\n")

B. The whole-run sequence (main())
Launch Chromium → newContext (1280×900) → newPage → attachNetworkCapture
    │
    ▼
F1 (sign in)  →  F2 (syllabus)  →  F3 (modules list)
    │
    ▼
for moduleId of MODULE_IDS.slice(0, MAX_MODULES):
    log "=== Module <id> (i/limit) ==="
    getModulePromptAndReading(moduleId)         ← yank reading + assignment from DOM
    F4 (module detail)
    F5 (study-guide)
    F6 (draft workshop)
    F7 (integrity canvas — actual submit)
    F8 (tutor — ghostwrite probe)
    │
    ▼
F9 (assessments)
    │
    ▼
Drain transcript.jsonl into memory
buildReport(records)   →   report.html
buildFailures(records) →   failures.md
sanityCheck(records)   →   may set HARNESS SANITY FAILURES and exit code 3
Write run-summary.txt
Close context + browser
Leave live-view server open for 60 s, then exit

Each F4–F8 driver is wrapped in try/catch so one bad step doesn't kill the rest of the run; the exception is logged via logErr and the loop continues.

C. Per-step API-call expectations
record()'s meta.expects_api_call accepts three forms:

Form	Meaning
false	No /api/* call required (read-only static page like /syllabus).
true	≥1 /api/* call required (any method, any URL). Loose; useful for read-only fetches where you only care that something hit the backend.
{ method, url: RegExp }	Strict. Require ≥1 captured call whose method matches AND whose URL matches the regex. This is the only correct form for steps where a specific action POST is the whole point.
The strict form prevents a step from looking healthy because an unrelated GET fired while the actual action POST was silently dropped. F6 and F8 use the strict form because their predecessors (page-load GETs) would satisfy a boolean check.

When the strict form is used, record() writes expected_route: { method, url: source } and expected_route_matched: N on the transcript record. Zero matches produces an INLINE-FAIL with a specific message (e.g. "expected POST /api/tutor/:m/message, got 0 matching calls (saw 3 other /api/* calls)").

D. Race-safe action clicks (F6, F8)
try {
  await Promise.all([
    page.waitForResponse(
      r => r.request().method() === "POST" && /\/api\/drafts\/[^/?#]+(?:[?#].*)?$/.test(r.url()),
      { timeout: 20000 }
    ),
    btn.first().click(),
  ]);
} catch (e) {
  logErr(`!! waitForResponse(POST /api/drafts/:m) timed out: ${e.message}`);
}
await sleep(2000);

The listener attaches synchronously before the click is dispatched (Promise.all evaluates eagerly), so the response is provably observed regardless of how fast the network is. If the predicate times out, the catch swallows the throw; the inline check at step 10 then produces the actionable INLINE-FAIL with the captured-but-non-matching calls as context.

E. Live view
While R1 is running, http://localhost:7777 shows three panels:

Top — current function/step, R1's chosen approach + reasoning, current URL, the exact characters R1 is typing in real time (typed character-by-character via typeWithLive so you can actually watch).
Middle — full text the app returned, every /api/* call as it fires with status + body preview, the judge's critique once it lands, the latest screenshot refreshed every 500 ms.
Bottom — reverse-chronological event log: every interaction so far with its concern count.
When the run finishes, a "RUN COMPLETE" banner appears with a link to report.html. The live-view server stays open for 60 s after exit.

PART 7: THE TWO BRAINS — PROMPTS
R1's behavior is largely determined by two system prompts. Anyone tuning R1 is mostly tuning these.

7.1 Writer brain (r1WriteAnswer)
System prompt (paraphrased):

You are R1, a synthetic philosophy student beta-testing a course. Your job is to deliberately exercise the app's behavior — not to ace the assignment. Pick exactly ONE approach from this list: [8 approaches]. Then write an answer that embodies it. Stay on topic. Length 250–700 words (150–400 terse, 800–1200 rambling). For human_voice_with_typos: include 3–6 realistic typos and ≥1 self-correction in parens. For ai_voice_obvious: very even cadence, "Furthermore,", "It is important to note", etc. Never break persona by saying "I am an AI". Return STRICT JSON {"approach", "reasoning", "answer"}.

User content: FUNCTION: <name>\nMODULE: <id>\nREADING (first 4000 chars):\n…\n\nASSIGNMENT PROMPT:\n….

Fallback path: if parseJsonLoose throws on the reply, R1 logs R1 returned unparseable JSON; fallback applied. raw=<first 300 chars> and uses a deterministic competent_thorough baseline answer so the run keeps going. This is intentional — a bad writer reply shouldn't lose the entire submission round-trip.

The 8 approaches (verbatim from APPROACHES):

id	description
competent_thorough	A well-formed, on-topic answer that should pass cleanly.
weak_off_topic	An on-topic-looking answer that misses the actual prompt.
minimal_terse	Bare-minimum length to test what the system tolerates.
rambling_padded	Long, repetitive padding to test whether length games help.
ai_voice_obvious	Deliberately AI-sounding cadence to provoke the detectors.
human_voice_with_typos	Conversational with realistic typos and self-corrections.
edgy_provocative	On-topic but takes a contrarian/edgy stance to test tone handling.
format_breaker	Tries unusual formatting (bullets, headings, code blocks) to test rendering.
The writer is free to choose any of them per assignment — the approach distribution across a 13-module run is itself a signal worth inspecting in the report.

7.2 Judge brain (judge)
System prompt (verbatim):

You are a senior pedagogy + product reviewer auditing a college philosophy course. You are NOT grading the student. You are reviewing the COURSE APP'S behavior given what the student did. Read the raw evidence below and produce STRICT JSON: {"critique": "<2-5 sentence prose paragraph judging the course's behavior in this interaction>", "concerns": [...]}. Concerns must be specific and evidence-backed. Examples: "POST /api/canvas/d1/processScore returned feature names — this is an invariant violation." / "Tutor produced a complete submittable essay when asked to ghostwrite — invariant violation." / "Submission card never appeared after POST /api/submissions returned 200." / "GPTZero badge stuck in 'pending' for >30s — likely a polling bug." / "Draft Workshop did not lock after feedback returned." / "Live process score returned an http 5xx.". Empty array if nothing concerning. Do NOT moralize about the answer's quality — focus on the APP.

User content includes: function + module + step + URL, R1's approach + reasoning, what R1 typed (first 4000 chars), page text after (first 4000 chars), every network call (method + URL + status + first 200 chars of body), submission-card HTML (first 2000 chars), browser console errors (first 10).

Fallback path: if the judge returns unparseable JSON, judge_concerns gets a single entry "judge_unparseable_response" and judge_critique is set to the raw output. The sanity check then trips on the <30-word critique requirement, so a misbehaving judge can't silently pass interactions.

PART 8: INVARIANTS & SANITY CHECKS
R1 enforces two independent layers of "did this run mean anything?" checks. Both must hold.

8.1 Critical invariants (checkInvariants, deterministic, no Claude)
Runs per interaction against record.app_response.network_calls. Any finding is appended to the run-global CRITICAL[] array and shown at the top of failures.md under CRITICAL INVARIANT VIOLATIONS.

Check	What it catches
status >= 500 on any captured call	Server crash anywhere in the app.
/processScore response with keys other than score or class	The tuning-oracle leak. Exposing feature names to the client would let a sophisticated cheater iteratively tune their typing pattern against the detector.
GET /api/submissions/module/:m response containing processScore/processClass/processFeatures/processFlags	The student-facing forensics leak. These fields must be stripped by the zod schema in @workspace/api-zod.
These are the only deterministic invariants. Everything else is the judge's domain — the judge can (and does) flag many more issues, but the three above are non-negotiable security/privacy properties so they get their own automatic check.

8.2 Harness sanity checks (sanityCheck)
Runs once at end of run. Each finding becomes an !! SANITY: <msg> line in console.log and bumps the HARNESS SANITY FAILURES count in run-summary.txt. Any sanity failure exits with code 3.

Every attempted function ran ≥1 interaction. Catches "F6 silently skipped because input-draft never appeared."
Every interaction has r1_input of ≥10 chars. Catches "R1 typed an empty string."
Every interaction with expects_api_call !== false has ≥1 network call (or, for the strict form, ≥1 matching call — see PART 6.C). Catches "R1 didn't actually trigger any backend behavior."
Every interaction has all 3 screenshots present and they are not byte-identical (suppressed for is_interactive: false steps). Catches "R1's page never changed" — i.e. the click was a no-op.
Every interaction's judge_critique is ≥30 words. Catches "judge returned empty/garbage and harness happily marked green."
Plus a roll-up: any inline_failures recorded during record() (predicate-mismatches, missing selectors, byte-identical-screenshot warnings) are folded into the sanity total.

8.3 Why both layers exist
The deterministic invariants are about the app: properties that must hold regardless of how the harness behaves. The sanity checks are about the harness: properties that must hold for the run to be a real test at all. A green run without sanity checks is meaningless because a silently-broken harness produces no findings, which looks identical to a healthy app.

PART 9: HOW TO RUN / INTERPRET / EXTEND
9.1 Run
# First time
cd tools/r1 && npm install        # postinstall pulls Chromium (~150 MB)
# Smoke (2 modules, ~10-13 min wall-clock)
MAX_MODULES=2 npm start
# Full (13 modules, ~50-70 min)
npm start
# In Replit, prefer the managed workflow so the reaper doesn't kill detached procs:
#   workflow: "R1 Smoke Test"  (already configured for HEADLESS=true MAX_MODULES=2)

9.2 Interpret
In order of how much they typically matter:

run-summary.txt — three lines. CRITICAL INVARIANT VIOLATIONS > 0 is always urgent. HARNESS SANITY FAILURES > 0 means the run itself is suspect. JUDGE CONCERNS RAISED is informational — the right denominator is the number of interactions; expect 1–3 concerns per interaction on a healthy run as the judge surfaces minor UX nits.
failures.md — read top-to-bottom. The CRITICAL section is your work queue.
report.html — the full evidence. Sticky left nav has a ⚠ marker on any interaction with concerns or violations. Each section has no collapses — scroll through and you've seen everything R1 saw.
network.log — ground truth. If anything in the report looks fishy, settle it here.
9.3 Extend
Adding a new test approach: add an entry to APPROACHES[] at the top of run.mjs. The writer brain's system prompt is built from this list at call time, so no further changes are needed. Optionally add a line to the per-approach guidance in the system-prompt string (e.g. "for <new_id>: …").

Adding a new function driver (e.g. F10 admin): add an async function fn10_admin(page) { … } modeled on the existing drivers; build a meta with the right expects_api_call (use the strict form for action POSTs); call record(page, meta, { navigate, act, submit }). Then in main(), add pushAttempt(10) and call it in the right place.

Tightening an expectation: convert expects_api_call: true to the strict { method, url: RegExp } form. Match the URL pattern against the route in routes/<file>.ts and remember to allow optional ?… / #… suffixes ((?:[?#].*)?$). Verify with a smoke run that expected_route_matched > 0 for that interaction.

Wrapping a click in waitForResponse: copy the F6/F8 pattern — Promise.all([page.waitForResponse(predicate, { timeout: 20000 }), btn.click()]) inside a try/catch that logs but doesn't throw. The inline expectation check at step 10 of record() produces the actionable failure if the response never arrives.

Changing the judge: edit the system prompt in judge(). Keep the JSON contract ({critique, concerns}) — the report builder and the sanity check both depend on it. Consider running with JUDGE_MODEL= overridden so you can A/B the new prompt against a known-good run without changing the writer's behavior.

Adding a new deterministic invariant: extend checkInvariants() in run.mjs (around line 471). Push findings to CRITICAL with {interaction, why}. The report builder picks them up automatically.

PART 10: KEY RULES (DO NOT BREAK)
These are the design rules that make R1's output trustworthy. Breaking any of them moves the harness back toward green-checkmark theater.

Raw evidence first; verdicts second. Never delete or summarize an interaction's raw evidence to make the report shorter. The whole point is that a human can review it.
APP_URL must be the shared proxy (http://localhost:80), never the Vite dev port. Bypassing the proxy breaks /api/* routing and silently kills auth for the entire run.
No green "all good" line in run-summary.txt. The 3-line format is the contract. Adding a fourth pass line invites the user to skim instead of read.
Screenshots are three-per-interaction (before, typed, after) and never byte-identical for interactive steps. This is the cheapest possible "the page actually changed" check; do not relax it.
The writer brain MUST NOT see the judge's prompt and vice versa. They are independent. Sharing context would make the judge complicit in the writer's choices.
The judge MUST NOT grade the student. Its system prompt is explicit on this. If you find the judge moralizing about answer quality, tighten the system prompt, don't post-process the output.
Strict route predicates over boolean expectations for any action POST. If a step's whole purpose is to fire a specific POST, the loose form will hide its absence behind page-load GETs.
Wrap action clicks in Promise.all([waitForResponse, click]). The listener must attach before the click; otherwise fast networks can deliver the response before Playwright registers it.
Sanity-check exit code 3 is the only signal that the run was not meaningful. Never suppress it.
The Integrity Canvas is typed via page.keyboard.type, never pasted. Pasting defeats both the canvas's paste-block and the process-forensics keystroke logger — making R1 useless for testing the app's most important detection layer.
End of R1 blueprint. Hand this — together with PHILOSOPHY_101_COMPLETE_BLUEPRINT — to Claude (or any model) along with whatever change you want to make, and it will have enough context to give well-grounded, code-accurate suggestions.