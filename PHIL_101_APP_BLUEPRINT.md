═══════════════════════════════════════════════════════════════════════════════
PSYCHOLOGY 101 — COMPLETE APP BLUEPRINT
(Hand this whole file to Claude. It is enough context to fine-tune anything
without re-reading the codebase from scratch.)
═══════════════════════════════════════════════════════════════════════════════

ONE-LINE DESCRIPTION
A pnpm monorepo that ships a single-course web app for an introductory
PSYCHOLOGY course (Branches of Psychology, Stanford Prison Experiment, classical/
operant/observational conditioning, eyewitness memory & Loftus, mind-brain
problem, nature vs. nurture, defining mental illness, Milgram obedience studies,
cognitive biases, bystander effect, plus a term paper). It includes a tutor
(Claude Sonnet 4.5), AI-detection on every submission (GPTZero + a second
in-house "writing-process forensics" layer), sequential-module gating, an admin
replay/forensics dashboard, and a Playwright synthetic-student beta-tester
harness called R1.

⚠ NAMING NOTE — THE REPO USES LEGACY "PHILOSOPHY" / "PHIL-101" LABELS
The web artifact directory is `artifacts/phil-101/`, its package name is
`@workspace/phil-101`, the OpenAPI description says "Philosophy 101 course
API", and several UI strings refer to philosophy. The CURRICULUM CONTENT is
unambiguously Psychology (see the 13-module list below; source file
`attached_assets/Clean_Psych_101_Course_Book.docx`). When working on the app,
treat the subject as Psychology; the "phil"/"Philosophy" tokens are inherited
from an earlier project name and should be renamed in any user-facing copy you
touch. Identifiers like the directory name, package name, and DB column values
are NOT yet renamed — be deliberate before changing them, because the artifact
manifest, workflows, and module IDs (d1..d7, e1..e5, tp) all encode the old
name implicitly.

═══════════════════════════════════════════════════════════════════════════════
REPO LAYOUT (high level)
═══════════════════════════════════════════════════════════════════════════════

workspace/                                       # pnpm monorepo root
├── .replit                                      # ports, workflows, deployment target
├── pnpm-workspace.yaml                          # globs: artifacts/*, lib/*, lib/integrations/*, scripts
├── package.json                                 # root scripts: typecheck, build
├── tsconfig.base.json / tsconfig.json
├── replit.md                                    # project overview + user preferences
├── README.md / qm_crosswalk.md
│
├── artifacts/
│   ├── api-server/                              # @workspace/api-server — Express 5 + pino
│   │   ├── build.mjs                            # esbuild bundler (CJS-ish ESM bundle via esbuild-plugin-pino)
│   │   ├── package.json
│   │   ├── .replit-artifact/artifact.toml       # kind=api, port=8080, run=dist/index.mjs
│   │   └── src/
│   │       ├── index.ts                         # listen on PORT
│   │       ├── app.ts                           # express() + middleware chain + mount /api router
│   │       ├── types.d.ts                       # Request augmentation (req.studentId)
│   │       ├── middlewares/
│   │       │   └── session.ts                   # cookie-parser-signed "session" cookie, 30-day expiry
│   │       ├── lib/
│   │       │   ├── logger.ts                    # pino (LOG_LEVEL env)
│   │       │   ├── curriculum.ts                # 13-module source-of-truth array (mirrored to phil-101)
│   │       │   ├── gptzero.ts                   # POST api.gptzero.me/v2/predict/text
│   │       │   ├── activityReport.ts            # turns keystrokes+scoreHistory into admin report
│   │       │   └── processForensics.ts          # ★ writing-process AI detector (pure analyzer, no I/O)
│   │       └── routes/
│   │           ├── index.ts                     # mounts all sub-routers under /api
│   │           ├── health.ts                    # GET /healthz
│   │           ├── auth.ts                      # /auth/login /auth/logout /auth/me
│   │           ├── progress.ts                  # /progress  /progress/intro
│   │           ├── drafts.ts                    # /drafts/:m  /drafts/:m/feedback
│   │           ├── canvas.ts                    # /canvas/:m  /canvas/:m/autosave  /score  /processScore
│   │           ├── submissions.ts               # POST /submissions  (the hot path; runs forensics)
│   │           ├── tutor.ts                     # /tutor/:m/conversation  /message (SSE)  /critique
│   │           ├── ai-actions.ts                # POST /ai/:m/:action  (study-guide, outline, …)
│   │           ├── integrity.ts                 # POST /integrity/ack
│   │           ├── admin.ts                     # /admin/* (requireAdmin)
│   │           └── diagnostic.ts                # /diagnostic/system  /diagnostic/functional
│   │
│   └── phil-101/                                # @workspace/phil-101 — Vite + React 19 + wouter + Tailwind 4
│       ├── index.html
│       ├── package.json                         # dev = "vite --host 0.0.0.0"
│       ├── vite.config.ts                       # ★ requires PORT and BASE_PATH env vars (throws if absent)
│       ├── components.json                      # shadcn config
│       ├── .replit-artifact/artifact.toml       # kind=web, port=24158
│       ├── public/{favicon.svg,opengraph.jpg}
│       └── src/
│           ├── main.tsx                         # createRoot(<App />)
│           ├── App.tsx                          # QueryClientProvider + TooltipProvider + WouterRouter
│           ├── index.css                        # tailwind base + custom CSS vars
│           ├── data/curriculum.ts               # CLIENT mirror of api-server/lib/curriculum.ts
│           ├── lib/
│           │   ├── integrity-api.ts             # ad-hoc fetchers for /canvas/* /drafts/* /admin/*
│           │   ├── admin.ts                     # useAdminOverride (?admin=true)
│           │   ├── sse.ts                       # fetchSse() — parses `data: {…}` + done:true / error
│           │   └── utils.ts                     # cn() = clsx + tailwind-merge
│           ├── hooks/
│           │   ├── use-toast.ts                 # shadcn toast hook
│           │   └── use-mobile.tsx               # matchMedia(max-width:768)
│           ├── components/
│           │   ├── nav.tsx                      # responsive header; admin link gated by user.isAdmin
│           │   ├── page-shell.tsx               # Footer + page chrome
│           │   ├── require-auth.tsx             # redirects to "/" if no session
│           │   ├── integrity-disclosure.tsx     # one-time modal gate (epoch-0 default = "not acked")
│           │   ├── draft-workshop.tsx           # Box 1: single-shot AI feedback, locks on use
│           │   ├── integrity-canvas.tsx         # ★ Box 2: paste-blocked editor + live forensics
│           │   ├── tutor-panel.tsx              # Claude tutor with SSE streaming + critique
│           │   ├── inline-ai-action.tsx         # per-module action buttons (study-guide, outline, …)
│           │   ├── ai-score-badge.tsx           # polling badge for pending GPTZero results
│           │   └── ui/…                         # shadcn/radix component set (~50 files)
│           └── pages/
│               ├── start-here.tsx               # login + intro form
│               ├── syllabus.tsx                 # course map
│               ├── modules.tsx                  # tile grid with sequential locks
│               ├── module-detail.tsx            # orchestrates draft + canvas + tutor + AI actions
│               ├── tutor.tsx                    # full-page chat
│               ├── assessments.tsx              # student's own past submissions
│               ├── admin-submissions.tsx        # admin: every submission, every student
│               ├── admin-submission-detail.tsx  # admin: replay + sparkline + ProcessForensicsView
│               ├── diagnostic.tsx               # auto-runs /diagnostic/system on mount
│               ├── support.tsx / accessibility.tsx
│               └── not-found.tsx
│
├── lib/                                         # ALL shared workspace packages
│   ├── db/                                      # @workspace/db
│   │   ├── drizzle.config.ts                    # dialect=postgresql, schema=src/schema/index.ts
│   │   └── src/
│   │       ├── index.ts                         # exports `db` (drizzle on pg.Pool) and `* from schema`
│   │       └── schema/
│   │           ├── index.ts                     # barrel
│   │           ├── students.ts                  # ★ has processBaseline jsonb
│   │           ├── submissions.ts               # ★ has aiScore/Class/CheckedAt/Status + process* + keystrokes
│   │           ├── drafts.ts                    # assignment_drafts (uniq student×module)
│   │           ├── canvasSessions.ts            # canvas_sessions (uniq student×module)
│   │           ├── tutorConversations.ts        # tutor_conversations + tutor_messages
│   │           ├── conversations.ts             # generic conversation (legacy / unused-ish)
│   │           └── messages.ts                  # ditto
│   ├── api-spec/                                # @workspace/api-spec — OpenAPI source of truth
│   │   ├── openapi.yaml                         # path-level contract (12 ops; admin/canvas/drafts NOT in spec)
│   │   └── orval.config.ts                      # codegen → api-zod + api-client-react
│   ├── api-zod/                                 # @workspace/api-zod — generated Zod schemas
│   ├── api-client-react/                        # @workspace/api-client-react — TanStack Query hooks
│   │   └── src/{index.ts, custom-fetch.ts}      # mutator that prefixes import.meta.env.BASE_URL
│   ├── integrations-anthropic-ai/               # @workspace/integrations-anthropic-ai
│   │   └── src/client.ts                        # exports `anthropic` (Anthropic SDK; uses 2 AI_INTEGRATIONS_ env vars)
│   └── integrations/                            # blueprint metadata (anthropic_ai_integrations/)
│
├── scripts/
│   └── post-merge.sh                            # `pnpm install --frozen-lockfile` && `pnpm --filter db push`
│
├── tools/                                       # NOT a pnpm package — standalone tooling
│   └── r1/                                      # ★ R1 synthetic-student beta-tester (Playwright + Anthropic)
│       ├── run.mjs                              # ~1350 lines, single-file harness, 9 function drivers F1–F9
│       ├── package.json                         # playwright + @anthropic-ai/sdk
│       ├── README.md
│       ├── R1_BLUEPRINT.md                      # full spec
│       └── runs/<timestamp>/                    # per-run artifacts (transcript.jsonl, report.html, …)
│
└── attached_assets/                             # course book sources + uploaded references
    ├── Clean_Psych_101_Course_Book.docx         # curriculum source (verbatim → curriculum.ts)
    ├── Pasted-R1-SYNTHETIC-STUDENT-BETA-TESTER-…txt     # R1 blueprint (412 lines)
    └── MODEL_WIZ_APP_BLUEPRINT_…txt             # the format this file follows

═══════════════════════════════════════════════════════════════════════════════
TECH STACK
═══════════════════════════════════════════════════════════════════════════════

• Monorepo:    pnpm workspaces (minimumReleaseAge=1440 enforced for supply-chain)
• Node:        24
• TypeScript:  ~5.9.2
• Frontend:    React 19.1 + Vite 7 + wouter 3 + TanStack Query 5 + Tailwind 4
               + shadcn/radix + sonner toasts + framer-motion
• Backend:     Express 5 + pino + cookie-parser + cors
• DB:          PostgreSQL 16 + drizzle-orm 0.45 (drizzle-zod for inserts)
• Validation:  Zod (zod/v4) + drizzle-zod
• API codegen: Orval (openapi.yaml → api-zod + api-client-react hooks)
• Bundling:    api-server uses esbuild (build.mjs) → dist/index.mjs (ESM)
               phil-101 uses Vite default build → dist/public
• AI:          Anthropic SDK (claude-sonnet-4-5 for everything user-facing,
               claude-haiku-4-5 for the diagnostic roundtrip ping)
• AI detect:   GPTZero v2 (https://api.gptzero.me/v2/predict/text) + in-house
               processForensics.ts (no external calls)
• Browser tests: Playwright (only in tools/r1/, not in CI workflows)

═══════════════════════════════════════════════════════════════════════════════
ARCHITECTURE NOTES
═══════════════════════════════════════════════════════════════════════════════

PATH-BASED ARTIFACT ROUTING (Replit-specific)
.replit declares ports → externalPort mappings:
  • localPort 8080  → externalPort 80     (api-server, also serves SPA at "/")
  • localPort 24158 → externalPort 3000   (phil-101 vite dev server)
  • localPort 7777  → externalPort 3001   (R1 live-view HTTP server)
  • localPort 8081  → externalPort 8081   (reserved)
The shared artifact-router on port 80 forwards `/api/*` to api-server and
everything else to the phil-101 vite server. Because the dev workflow sets
`BASE_PATH=/`, the SPA mounts at root and wouter's base is "" — NOT "/phil-101".
The R1 harness therefore uses `APP_URL=http://localhost:80` and `APP_BASE=""`.

LLM USAGE MAP (every server-side Anthropic call)
The integration package `@workspace/integrations-anthropic-ai` exports `anthropic`.
It requires BOTH env vars (throws on import if either is missing):
  • AI_INTEGRATIONS_ANTHROPIC_BASE_URL   (Replit-managed proxy URL)
  • AI_INTEGRATIONS_ANTHROPIC_API_KEY    (Replit-managed key)
Call sites:
  • tutor.ts:54        claude-sonnet-4-5  max=1024   Tutor SSE stream per module
                       System prompt: a Psychology tutor that helps the student
                       explore the module's objectives Socratically WITHOUT
                       giving away the answer to the assignment.
  • tutor.ts:101       claude-sonnet-4-5  max=600    Critique exercise — generates
                       a deliberately weak Psychology answer the student must
                       diagnose and improve.
  • drafts.ts:48       claude-sonnet-4-5  max=800    One-shot draft feedback in
                       5 structured sections (clarity, evidence, structure,
                       psychological accuracy, suggested next step).
  • ai-actions.ts:40   claude-sonnet-4-5  max=1024   Inline actions (study-guide,
                       outline, flashcards, …) grounded in the module's reading.
  • diagnostic.ts:314  claude-haiku-4-5   max=16     Roundtrip ping ("Say 'ok'").

⚠ All system prompts currently say "philosophy" / "philosophy tutor" in places.
For a clean rename, search server-side for /philosoph/i and update to
"psychology". See "Known gaps" at the bottom.

THE INTEGRITY CANVAS (THE differentiator — components/integrity-canvas.tsx)
A two-box workflow inside `/modules/:id`:
  Box 1 — draft-workshop.tsx
    • Free-form textarea.
    • Single "Get AI feedback" button (`POST /api/drafts/:m/feedback`).
    • Returns one structured 5-section critique. After the first call the
      draft is LOCKED in the DB (assignment_drafts.locked = true) so students
      cannot iterate via AI on the workshop draft.
  Box 2 — integrity-canvas.tsx (the hardened editor)
    • contentEditable div with a transparent overlay that intercepts paste,
      drop, and right-click. Cmd/Ctrl+V is suppressed.
    • Autosaves every 5s to `POST /api/canvas/:m/autosave`.
    • Streams every keystroke into two parallel logs:
        (legacy) {k: <char|"\b">, d: <delta ms}
        (rich)   {type, len, caretBefore, caretAfter, text, charCount}
      The rich log feeds processForensics; the legacy log feeds activityReport.
    • Debounced live GPTZero scoring: triggers when accumulated change ≥30
      chars OR a burst of ≥200 chars lands. `POST /api/canvas/:m/score`.
    • Traffic-light bar (green/amber/red) reflects the latest score class.
    • If the bar stays red for ≥30s cumulative within a session, an in-page
      warning banner is shown ("Your writing pattern resembles AI-generated
      text").
    • Process-forensics traffic-light is a SECOND bar wired to
      `POST /api/canvas/:m/processScore`, throttled to ≤1/60s. Returns ONLY
      `{score, class}` — no feature names ever reach the client.
    • Submit always goes to `POST /api/submissions` with the full payload
      (content, keystrokes, scoreHistory, finalAiScore, finalAiClass,
      flaggedOnSubmit). If `flaggedOnSubmit` is true, the UI shows a confirm
      dialog with a "Submit Anyway" button.
    • Accommodated students (admin toggle) get a plain `<textarea>`, no
      paste-block, no scoring, no monitoring — submission still succeeds and
      `aiStatus` is still computed server-side.

WRITING-PROCESS FORENSICS (lib/processForensics.ts, ~686 lines)
A pure analyzer: NO I/O, NO DB, NO env reads — exactly so the diagnostic harness
can exercise it on synthetic inputs.
  • Entry: `analyzeProcessWithBaseline(events, finalText, baseline)` → returns
    {processScore (0–100), processClass ("human" | "mixed" | "likelyAI"),
     features, flags, baselineAdjustedScore, baselineDeviation}.
  • Sparse-data guard: skips analysis entirely if events.length < 20 OR
    finalText.length < 80. The submission is persisted with null process*
    columns in that case.
  • Features extracted: linearProgress, meanInterBurstGap, burstSpeed,
    abandonedStarts, structuralDeletes, caretBacktracks (+ sub-features
    feeding the score weights).
  • Score → class thresholds: <35 human, 35–65 mixed, >65 likelyAI.
  • Per-student baseline (`students.processBaseline` jsonb {n, features}) is
    folded in for the FIRST 2 submissions, then FROZEN at n=2 to prevent
    slow-drift training attacks where a student gradually shifts the baseline
    toward their cheating profile.
  • `foldIntoBaseline(baseline, features)` returns the new {n+1, features}.

GPTZERO INTEGRATION (lib/gptzero.ts)
  • `checkWithGPTZero(text)` POSTs to https://api.gptzero.me/v2/predict/text
    with header `x-api-key: $GPTZERO_API_KEY`.
  • Reads `documents[0].completely_generated_prob` (0–1) and
    `documents[0].predicted_class` ("human" | "ai" | "mixed").
  • If GPTZERO_API_KEY is missing, returns null silently. The caller stores
    `aiStatus: "failed"`.
  • On the live canvas, scoring is called via the server proxy
    (`/api/canvas/:m/score`) NOT directly from the browser, so the key stays
    server-side.

THE SUBMISSION HOT PATH (routes/submissions.ts:38–194)
1. Validate body (moduleId, content, optional keystrokes/scoreHistory/flaggedOnSubmit).
2. Look up the module in `lib/curriculum.ts`. 400 if unknown.
3. Sequential gating: query existing submissions for this student; if any
   earlier module is missing a submission, 403 with the list of missing IDs.
4. Compute `activityReport` if keystrokes+scoreHistory present.
5. Process forensics: if eligible (≥20 events AND ≥80 chars), load baseline,
   analyze, build processFeaturesPayload (real features + __baselineAdjustedScore,
   __baselineDeviation, __baselineSnapshot, __baselineN). Fold into baseline
   only if baseline.n < 2.
6. INSERT row with aiScore=null, aiClass=null, aiStatus='pending'.
7. UPDATE student.processBaseline if it grew.
8. RETURN 201 with the parsed submission immediately.
9. Background (no await): `runAICheck(id, content)` calls GPTZero, then
   UPDATEs the row with the result and aiStatus='completed' (or 'failed').

The web client polls `GET /api/submissions/module/:id` (and the list endpoint)
every 2–2.5s while any submission is `pending`. `ai-score-badge.tsx` owns the
polling.

ONE-TIME INTEGRITY DISCLOSURE
  • Modal `IntegrityDisclosureGate` renders on first module load if the
    current student's `integrityAckAt` is null or epoch 0 (default).
  • Ack via `POST /api/integrity/ack` (route writes `now()`).
  • The modal copy is intentionally generic — it does NOT name the
    process-forensics layer.

ADMIN
  • First authenticated user can claim admin: `POST /api/admin/bootstrap`
    (no-op if any admin already exists).
  • Subsequent admin promotion only by an existing admin.
  • `requireAdmin` middleware: `req.session.student.isAdmin === true` else 403.
  • Dashboard at `/admin/submissions`: table of all student work + ai/process
    classes + sparkline of live score over time.
  • Detail at `/admin/submissions/:id`: full content, keystroke replay (using
    the legacy `{k,d}` log), activityReport panel, and `ProcessForensicsView`
    (per-feature values, baseline snapshot, deviation %, human-readable flags).
    HIDDEN from non-admins because student-facing API routes strip these
    columns via the api-zod `SubmissionZ` / `SubmissionOrNullZ` schemas.
  • Per-student accommodation toggle: `POST /api/admin/students/:id/accommodate`.

THE DIAGNOSTIC HARNESS (routes/diagnostic.ts + pages/diagnostic.tsx)
Auto-runs `/api/diagnostic/system` on mount. 11 checks:
  1. env DATABASE_URL exists
  2. env SESSION_SECRET exists
  3. env AI_INTEGRATIONS_ANTHROPIC_* exists
  4. env GPTZERO_API_KEY exists (WARN, not FAIL, if missing)
  5. Database connectivity (SELECT 1)
  6. Database tables reachable (students + submissions)
  7. Curriculum loaded (length === 13)
  8. /api/healthz local fetch returns 200
  9. Process forensics: SYNTHETIC TRANSCRIPTION input scores as likelyAI
 10. Process forensics: SYNTHETIC COMPOSITION input scores as human
 11. Anthropic roundtrip: claude-haiku-4-5 + "Say 'ok'"
A button also runs `/api/diagnostic/functional`: full login → progress → 403
gating → submission → cleanup against a temporary diagnostic student.

THE R1 SYNTHETIC-STUDENT HARNESS (tools/r1/, standalone)
NOT a workspace package. Drives the real Chromium against the real app via
Playwright, using two Claude brains (writer + judge) per interaction. Produces
`runs/<ts>/{transcript.jsonl, report.html, failures.md, network.log,
console.log, run-summary.txt, screenshots/}`. Self-audit exits with code 3 if
no real work was done. Workflow `R1 Smoke Test` configured but NOT auto-started
(uses ~10 min of Anthropic credits per smoke). See `tools/r1/R1_BLUEPRINT.md`
for the full spec.

═══════════════════════════════════════════════════════════════════════════════
DATABASE SCHEMA (lib/db/src/schema/*)
═══════════════════════════════════════════════════════════════════════════════

students                              (schema/students.ts)
  id              serial PK
  email           text NOT NULL UNIQUE
  name            text NOT NULL
  intro           text NULLABLE              -- self-introduction
  created_at      timestamptz NOT NULL DEFAULT now()
  is_admin        boolean NOT NULL DEFAULT false
  accommodated    boolean NOT NULL DEFAULT false
  integrity_ack_at timestamptz NULLABLE      -- one-time disclosure ack
  process_baseline jsonb NULLABLE            -- {n, features}; FROZEN at n=2

submissions                           (schema/submissions.ts)
  id              serial PK
  student_id      int NOT NULL REFERENCES students(id) ON DELETE CASCADE
  module_id       text NOT NULL              -- "d1".."d7", "e1".."e5", "tp"
  content         text NOT NULL
  created_at      timestamptz NOT NULL DEFAULT now()
  -- GPTZero (background):
  ai_score        real NULLABLE              -- 0..1 prob AI-generated
  ai_class        text NULLABLE              -- "human" | "ai" | "mixed"
  ai_checked_at   timestamptz NULLABLE
  ai_status       text NOT NULL DEFAULT 'pending'   -- pending|completed|failed
  -- Captured client signals (only present for the canvas, not legacy):
  keystrokes      jsonb NULLABLE             -- BOTH legacy and rich event shapes
  score_history   jsonb NULLABLE             -- sampled GPTZero scores during typing
  activity_report jsonb NULLABLE             -- computed by activityReport.ts on insert
  flagged_on_submit boolean NOT NULL DEFAULT false   -- what the live client believed
  -- Process forensics (synchronous, on insert):
  process_score   int NULLABLE               -- 0..100
  process_class   text NULLABLE              -- "human" | "mixed" | "likelyAI"
  process_features jsonb NULLABLE            -- features + __baselineAdjustedScore/__baselineDeviation/__baselineSnapshot/__baselineN
  process_flags   jsonb NULLABLE             -- human-readable strings
  review_status   text NULLABLE              -- admin workflow state

assignment_drafts                     (schema/drafts.ts)
  id          serial PK
  student_id  int NOT NULL FK→students
  module_id   text NOT NULL
  content     text NOT NULL
  feedback    text NULLABLE              -- AI feedback (one shot)
  feedback_at timestamptz NULLABLE
  locked      boolean NOT NULL DEFAULT false  -- becomes true after first feedback call
  created_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE INDEX draft_student_module (student_id, module_id)

canvas_sessions                       (schema/canvasSessions.ts)
  id          serial PK
  student_id  int NOT NULL FK→students
  module_id   text NOT NULL
  content     text NOT NULL DEFAULT ''
  keystrokes  jsonb NOT NULL DEFAULT []
  score_history jsonb NOT NULL DEFAULT []
  updated_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE INDEX canvas_student_module (student_id, module_id)

tutor_conversations                   (schema/tutorConversations.ts)
  id          serial PK
  student_id  int NOT NULL FK→students
  module_id   text NOT NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE INDEX tutor_conv_student_module (student_id, module_id)

tutor_messages                        (schema/tutorConversations.ts)
  id              serial PK
  conversation_id int NOT NULL FK→tutor_conversations
  role            text NOT NULL              -- "user" | "assistant"
  content         text NOT NULL
  created_at      timestamptz NOT NULL DEFAULT now()

conversations / messages              (schema/conversations.ts, messages.ts)
  Legacy generic-chat tables; unused by the current UI. Safe to drop in a
  future cleanup if no consumers appear.

═══════════════════════════════════════════════════════════════════════════════
CURRICULUM — 13 PSYCHOLOGY MODULES
(source = artifacts/api-server/src/lib/curriculum.ts,
 mirrored to artifacts/phil-101/src/data/curriculum.ts,
 original source-of-truth = attached_assets/Clean_Psych_101_Course_Book.docx)
═══════════════════════════════════════════════════════════════════════════════

Each module: { id, number, title, points, type, objectives[], reading, assignment, modelResponse }

  d1  (50, discussion) Branches of Psychology
  e1  (50, essay)      The Stanford Prison Experiment
  d2  (50, discussion) Classical, Operant, and Observational Conditioning
  e2  (50, essay)      Cognitive Dissonance
  d3  (50, discussion) Memory and Eyewitness Testimony
  e3  (50, essay)      The Reliability of Memory
  d4  (50, discussion) The Mind-Brain Problem
  e4  (50, essay)      Nature vs. Nurture
  d5  (50, discussion) Defining Mental Illness
  e5  (50, essay)      The Milgram Obedience Studies
  d6  (50, discussion) Cognitive Biases
  d7  (50, discussion) The Bystander Effect
  tp (200, termpaper)  Term Paper (Outline + Final)

Sequential gating: server enforces that prior IDs (in array order) must each
have at least one submission before a later one can be submitted.

═══════════════════════════════════════════════════════════════════════════════
ROUTES (every Express handler — file:line)
═══════════════════════════════════════════════════════════════════════════════

All mounted under /api by app.ts:34. All auth-bearing routes pass through
`attachSession` first; protected routes additionally use `requireStudent`.

HEALTH                                   (no auth)
  GET    /healthz                              health.ts:6        → { status: "ok" }

AUTH                                     (attachSession on all)
  POST   /auth/login                           auth.ts:19         Find or create student by email; set session cookie. Body: {email, name}.
  POST   /auth/logout                          auth.ts:51         Clear session cookie. 204.
  GET    /auth/me                              auth.ts:56         { student } | { student: null }.

PROGRESS                                 (requireStudent)
  GET    /progress                             progress.ts:11     { completedModuleIds[], intro }.
  POST   /progress/intro                       progress.ts:28     Update students.intro. Body: {intro}.

DRAFTS                                   (requireStudent)
  GET    /drafts/:moduleId                     drafts.ts:12       Row or null from assignment_drafts.
  POST   /drafts/:moduleId                     drafts.ts:26       Upsert content (cannot overwrite if locked=true).
  POST   /drafts/:moduleId/feedback            drafts.ts:48*      Run Claude on the saved draft, persist {feedback, feedbackAt, locked:true}. Single-shot.
  *line approximate; see file for exact.

CANVAS                                   (requireStudent)
  GET    /canvas/:moduleId                     canvas.ts:14       Row or null from canvas_sessions.
  POST   /canvas/:moduleId/autosave            canvas.ts:30       Body: {content, keystrokes?, scoreHistory?}. Upsert by (student,module). 5-s cadence from client.
  POST   /canvas/:moduleId/score               canvas.ts:52       Server-side GPTZero proxy. Body: {text}. Returns {score, class}. Used for the live traffic light.
  POST   /canvas/:moduleId/processScore        canvas.ts:79       Returns ONLY {score, class} from processForensics. No feature names ever leak.

SUBMISSIONS                              (requireStudent)
  GET    /submissions                          submissions.ts:24  All of this student's submissions, newest first. (Student-facing schema — strips process* columns via Zod.)
  POST   /submissions                          submissions.ts:38  The hot path described above.
  GET    /submissions/module/:moduleId         submissions.ts:196 Latest for (student, module) or null.

TUTOR                                    (requireStudent)
  GET    /tutor/:moduleId/conversation         tutor.ts:14        Get or create the conversation; returns all messages.
  POST   /tutor/:moduleId/message              tutor.ts:36        SSE stream: assistant chunks as `data: {delta}` then `done:true`. Persists both user + assistant messages.
  POST   /tutor/:moduleId/critique             tutor.ts:89        Generate a deliberately weak Claude answer (max 600 toks) for the student to critique.

AI ACTIONS                               (requireStudent)
  POST   /ai/:moduleId/:action                 ai-actions.ts:13   action ∈ {study-guide, outline, flashcards, …}. One-shot response (max 1024 toks).

INTEGRITY                                (requireStudent)
  POST   /integrity/ack                        integrity.ts:9     Sets students.integrity_ack_at = now(). 204.

ADMIN                                    (requireStudent + requireAdmin except bootstrap)
  POST   /admin/bootstrap                      admin.ts:10        First authenticated caller becomes admin if no admin exists.
  GET    /admin/submissions                    admin.ts:22        Full list with all process* columns + student joined.
  GET    /admin/submissions/:id                admin.ts:46        Single row + activityReport + keystrokes for replay.
  POST   /admin/submissions/:id/review         admin.ts:69        Update review_status. Body: {status}.
  GET    /admin/students                       admin.ts:86        Full student list (no PII redaction beyond what's in the row).
  POST   /admin/students/:id/accommodate       admin.ts:103       Toggle students.accommodated.

DIAGNOSTIC                               (no auth)
  GET    /diagnostic/system                    diagnostic.ts:53   11-check system probe (see Architecture Notes).
  POST   /diagnostic/functional                diagnostic.ts:328  End-to-end smoke against a throwaway diagnostic student.

═══════════════════════════════════════════════════════════════════════════════
OPENAPI / GENERATED CLIENTS
═══════════════════════════════════════════════════════════════════════════════

`lib/api-spec/openapi.yaml` defines only the public-facing, stable surface:
  healthCheck, login, logout, getCurrentStudent, getProgress, saveIntro,
  listSubmissions, createSubmission, getSubmissionForModule,
  getTutorConversation, sendTutorMessage, generateCritiqueAnswer.

KNOWN GAP: drafts, canvas, ai-actions, integrity, admin, diagnostic are NOT in
the OpenAPI spec. They are called from the SPA via `lib/integrity-api.ts`
(ad-hoc fetchers) rather than via generated TanStack Query hooks. Adding them
to openapi.yaml + re-running `pnpm --filter @workspace/api-spec run codegen`
would generate full typed hooks and tighten the contract.

Generated outputs:
  • lib/api-zod/src/generated/*      — Zod schemas (Request/Response per op)
  • lib/api-client-react/src/index.ts — `useLogin`, `useGetProgress`, etc.
  • Both treated as locked (do not hand-edit).

═══════════════════════════════════════════════════════════════════════════════
FRONTEND DATA-TESTID INVENTORY (used by R1)
═══════════════════════════════════════════════════════════════════════════════

Login (start-here.tsx)
  input-email, input-name, button-login

Module detail (module-detail.tsx + sub-components)
  button-ack-integrity        (integrity-disclosure.tsx)
  input-draft                 (draft-workshop.tsx, textarea)
  button-get-feedback         (draft-workshop.tsx)
  input-canvas                (integrity-canvas.tsx, contentEditable)
  input-canvas-accommodated   (integrity-canvas.tsx, plain textarea fallback)
  button-submit               (integrity-canvas.tsx)
  button-submit-anyway        (integrity-canvas.tsx confirm dialog)
  button-ai-study-guide etc.  (inline-ai-action.tsx, one per action)

Tutor (tutor.tsx + tutor-panel.tsx)
  input-tutor-message, button-send-message, button-critique

KNOWN MISSING TESTID: submission-card (or per-row testid on assessments.tsx).
R1 records an empty string for it and lets the judge brain flag the gap.

═══════════════════════════════════════════════════════════════════════════════
ENVIRONMENT VARIABLES (exhaustive)
═══════════════════════════════════════════════════════════════════════════════

REQUIRED (throws on startup if missing)
  DATABASE_URL                              lib/db/src/index.ts:7         Postgres connection.
  SESSION_SECRET                            artifacts/api-server/src/middlewares/session.ts:9   Cookie signing.
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL        lib/integrations-anthropic-ai/src/client.ts:3       Replit-managed proxy.
  AI_INTEGRATIONS_ANTHROPIC_API_KEY         lib/integrations-anthropic-ai/src/client.ts:9       Replit-managed key.
  PORT                                      artifacts/phil-101/vite.config.ts (and api-server)  Both artifacts crash if missing.
  BASE_PATH                                 artifacts/phil-101/vite.config.ts                   Currently set to "/" for dev workflow.

OPTIONAL (degrade gracefully if missing)
  GPTZERO_API_KEY                           artifacts/api-server/src/lib/gptzero.ts             Submissions still succeed; aiStatus="failed".
  LOG_LEVEL                                 artifacts/api-server/src/lib/logger.ts              Default "info".
  NODE_ENV                                  several places                                       "development" vs "production".
  REPL_ID                                   artifacts/phil-101/vite.config.ts                   Enables cartographer + dev-banner plugins when set.

R1 HARNESS ONLY (tools/r1/run.mjs)
  APP_URL (default http://localhost:80), APP_BASE (default ""),
  API_URL (default http://localhost:8080), HEADLESS (default false),
  MAX_MODULES (default 3, range 1..12), TYPE_DELAY_MS (default 15),
  ANTHROPIC_API_KEY (direct) OR reuses AI_INTEGRATIONS_ANTHROPIC_*,
  REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE (Replit-provided chromium path).

═══════════════════════════════════════════════════════════════════════════════
WORKFLOWS / RUN
═══════════════════════════════════════════════════════════════════════════════

Registered workflows (managed by Replit, not in source):
  • "artifacts/phil-101: web"     pnpm --filter @workspace/phil-101 run dev   (vite on PORT=24158)
  • "artifacts/api-server: API Server"  pnpm --filter @workspace/api-server run dev  (build + node dist on PORT=8080)
  • "R1 Smoke Test"               cd tools/r1 && HEADLESS=true MAX_MODULES=2 npm start  (autoStart=false; manual trigger)

.replit `runButton = "Project"` runs the parallel composite that starts
R1 Smoke Test (which itself depends on the two app workflows being up; in
practice they're always running because of the artifact runner).

Root scripts (package.json)
  pnpm typecheck   — tsc --build on libs + per-artifact typecheck
  pnpm build       — typecheck + all `build` scripts recursively

Per-package commands worth knowing
  pnpm --filter @workspace/db run push                  Apply schema to DATABASE_URL (dev).
  pnpm --filter @workspace/api-spec run codegen         Regenerate api-zod + api-client-react.
  pnpm --filter @workspace/api-server run dev           Build + run the API.
  pnpm --filter @workspace/phil-101 run dev             Vite dev server.

Post-merge hook (.replit → scripts/post-merge.sh, 20s timeout)
  pnpm install --frozen-lockfile && pnpm --filter @workspace/db push

═══════════════════════════════════════════════════════════════════════════════
KEY LINE-NUMBER LANDMARKS
═══════════════════════════════════════════════════════════════════════════════

artifacts/api-server/src/routes/submissions.ts
  L38      POST /submissions handler start (the hot path)
  L68–84   Sequential gating (403 with missing-IDs list)
  L95–98   computeActivityReport call
  L100–154 Process forensics block (sparse-data guard at 112–113, baseline freeze at 145)
  L156–175 INSERT submissions
  L177–185 UPDATE students.processBaseline
  L188     201 response (before background AI check)
  L192     `void runAICheck(...)` — fire-and-forget
  L216–243 runAICheck implementation

artifacts/api-server/src/lib/processForensics.ts
  L10      MIN_EVENTS_FOR_SCORE = 20  ;  MIN_CHARS_FOR_SCORE = 80
  L12      BASELINE_FREEZE_N = 2
  L86      analyzeProcess() entry
  L133     score→class thresholds (human <35, mixed 35–65, likelyAI >65)

artifacts/api-server/src/routes/tutor.ts
  L36      POST /tutor/:m/message — SSE handler
  L54      anthropic.messages.stream() call (claude-sonnet-4-5, 1024 toks)
  L89      POST /tutor/:m/critique
  L101     anthropic.messages.create() — deliberately weak answer (600 toks)

artifacts/api-server/src/routes/canvas.ts
  L52      POST /canvas/:m/score — GPTZero proxy
  L79      POST /canvas/:m/processScore — returns ONLY {score, class}

artifacts/api-server/src/routes/diagnostic.ts
  L53      GET /system — 11 checks
  L314     Anthropic roundtrip check (haiku, max=16)
  L328     POST /functional — full E2E flow

artifacts/api-server/src/middlewares/session.ts
  L9       throws if SESSION_SECRET missing
  L21      30-day cookie expiry
  L46      attachSession middleware
  L74      requireStudent middleware

artifacts/phil-101/src/App.tsx
  L33–72   Route table (Switch/Route declarations)
  L81      WouterRouter base = import.meta.env.BASE_URL.replace(/\/$/, "")

artifacts/phil-101/src/components/integrity-canvas.tsx
  L30      Component start
  L120     30-s cumulative-red warning logic
  L160     Keystroke event shape (legacy + rich)
  L218     5-s autosave interval
  L232     Debounced live GPTZero scoring call
  L280     "Submit Anyway" confirm dialog

artifacts/phil-101/src/components/draft-workshop.tsx
  L15      Component start; lock-on-feedback flow

artifacts/phil-101/src/components/tutor-panel.tsx
  L12      Component start; uses lib/sse.ts fetchSse helper

artifacts/phil-101/src/lib/integrity-api.ts
  L33      Exports: getDraft, postDraft, getCanvas, autosave, score,
           processScore, ack, listSubmissions, getSubmission, review,
           setAccommodated.

tools/r1/run.mjs
  L31–36   APP_URL/APP_BASE/API_URL/HEADLESS/MAX_MODULES/TYPE_DELAY_MS defaults
  L91–107  Anthropic client init (prefers direct key, falls back to integration)
  L283–288 isApiUrl() filter (pathname.startsWith("/api/"))
  L409–433 Judge brain system prompt + user content assembly
  L483–501 Deterministic invariants (5xx, processScore key allow-list, forensics-leak scan)
  L543–551 normaliseExpects()
  L559–694 record() — the interaction recorder (reset → navigate → act → snapshot → judge)
  L770–797 fn1_signIn (form wait + type)
  L901–907 fn6 Promise.all click pattern (race-safe)
  L1006–1012 fn8 Promise.all click pattern
  L1194–1202 sanityCheck() screenshot byte-identity rule (skip if !is_interactive)
  L1261–1264 chromium.launch with REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
  L1311      sanityCheck called BEFORE the 60-s live-view delay
  L1314–1328 3- or 4-line run-summary.txt assembly
  L1341      60-s live-view keep-open

═══════════════════════════════════════════════════════════════════════════════
USER PREFERENCES (also in replit.md)
═══════════════════════════════════════════════════════════════════════════════

• Plain, everyday language in all UI copy.
• NEVER show raw error messages to the student; surface friendly summaries.
• Default-friendly: don't block the user with validation toasts.
• AI-detection messaging is deliberately generic — never name "GPTZero" or
  "writing-process forensics" in student-facing copy.
• Sequential module gating is a feature, not a bug — keep the 403 flow.
• Accommodated students get a plain textarea and no live monitoring; the
  server still records aiStatus but does not enforce on it.

═══════════════════════════════════════════════════════════════════════════════
FORBIDDEN / LOCKED FILES
═══════════════════════════════════════════════════════════════════════════════

Do not hand-edit:
  • package.json files (use pnpm to add/remove deps)
  • pnpm-workspace.yaml (especially minimumReleaseAge=1440)
  • artifacts/phil-101/vite.config.ts (PORT + BASE_PATH guards)
  • artifacts/api-server/build.mjs
  • lib/db/drizzle.config.ts
  • lib/api-zod/src/generated/** (Orval output)
  • lib/api-client-react/src/generated/** (Orval output) — note: in this repo
    the generated hooks live directly in src/index.ts; treat that file as
    Orval output too.
  • lib/integrations-anthropic-ai/src/client.ts (uses Replit-managed proxy;
    do not switch back to a direct ANTHROPIC_API_KEY without consulting the
    integrations skill).

═══════════════════════════════════════════════════════════════════════════════
EXTERNAL DEPENDENCIES
═══════════════════════════════════════════════════════════════════════════════

AI:           Anthropic (claude-sonnet-4-5 + claude-haiku-4-5 via Replit integration proxy)
AI Detection: GPTZero v2 + in-house processForensics.ts (no external)
DB:           Replit-managed PostgreSQL 16 + Drizzle ORM
Sessions:     cookie-parser signed cookies (no external session store)
Browser test: Playwright + Chromium (Replit-provided executable)
Course book:  attached_assets/Clean_Psych_101_Course_Book.docx — verbatim source for curriculum.ts

═══════════════════════════════════════════════════════════════════════════════
KNOWN GAPS / GOOD CANDIDATES FOR FINE-TUNING
═══════════════════════════════════════════════════════════════════════════════

• OpenAPI spec covers only ~12 of ~25 endpoints. Drafts, canvas, AI actions,
  integrity, admin, and diagnostic routes are called via ad-hoc fetchers in
  `lib/integrity-api.ts`. Promoting them to the spec → codegen would tighten
  types end-to-end.

• Two `curriculum.ts` files (frontend + backend) duplicate ~780 lines. A
  shared `@workspace/curriculum` package would eliminate drift risk.

• `conversations` + `messages` schema tables are legacy / unused by current UI.

• No automated test runner in CI — the only test layer is the R1 harness +
  the in-app diagnostic page.

• `assessments.tsx` rows have no per-row testid (R1 records an empty string
  for `submission-card`). Adding `data-testid="submission-card"` would let
  R1 verify the submission landed.

• `vite.config.ts` requires BASE_PATH but the dev workflow sets it to "/" —
  meaning the SPA mounts at root. Anything that builds URLs from
  `import.meta.env.BASE_URL` is consistent today, but if BASE_PATH ever
  changes to "/phil-101/" the R1 harness needs `APP_BASE=/phil-101` and any
  hard-coded path assumptions break.

• The integrity canvas's keystroke log carries BOTH legacy `{k,d}` events
  (for activityReport) AND rich events (for processForensics). The rich
  events are a strict superset; consolidating would shrink payload size and
  simplify analyzer code, but requires a coordinated migration of
  activityReport.ts.

• SUBJECT/NAME MISMATCH — the codebase says "philosophy" but teaches
  psychology. To clean this up cohesively:
    1. UI strings: grep -ri 'philosoph' artifacts/phil-101/src — rewrite to
       "psychology" / "Psychology 101".
    2. Server strings & system prompts: grep -ri 'philosoph' artifacts/api-server/src
       — rewrite. The Anthropic system prompts in tutor.ts, drafts.ts,
       ai-actions.ts, and tutor.ts (critique) all mention philosophy.
    3. OpenAPI description: lib/api-spec/openapi.yaml line 6 ("Philosophy 101
       course API") — rewrite to Psychology 101.
    4. Artifact title: artifacts/phil-101/.replit-artifact/artifact.toml
       sets `title = "Philosophy 101"` — rewrite to Psychology 101.
    5. Directory/package rename (`artifacts/phil-101` → `artifacts/psych-101`
       and `@workspace/phil-101` → `@workspace/psych-101`) is a bigger change
       that touches workflows, the artifact registry, the R1 harness defaults,
       pnpm-lock.yaml, and any deployment configs. Leave for a separate pass.

═══════════════════════════════════════════════════════════════════════════════
END OF BLUEPRINT
═══════════════════════════════════════════════════════════════════════════════
