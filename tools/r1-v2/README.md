# R1-v2 — Synthetic-Student Beta-Tester for Psychology 101

Single-file Playwright harness that drives the running app end-to-end with
two Claude brains (writer + judge), captures raw evidence (network bodies,
SSE streams, three-screenshots-per-step, judge critique), and verifies
**12 critical invariants** defined in the build spec.

> **Relationship to `tools/r1/`** — this is the next-generation harness. The
> original `tools/r1/run.mjs` (F1–F9) is preserved for comparison; do not
> delete it. R1-v2 lives alongside it in `tools/r1-v2/`, has its own
> `node_modules`, and **is not a pnpm workspace member** so it does not trip
> the workspace's `minimumReleaseAge` enforcement.

## Quick start

```bash
cd tools/r1-v2
npm install                       # one-time (Playwright + Anthropic SDK)
npm start                         # full plan, MAX_MODULES=3 default
npm run smoke                     # MAX_MODULES=2, skips slow/conditional functions
```

Live view streams to <http://localhost:7777> while a run is in progress.
After the run finishes the report sits at `runs/<timestamp>/report.html`.

## What it tests

18 functions, mapped to 12 critical invariants A–L. The full plan is in the
build spec (see `attached_assets/Pasted-2-06-PM…txt`). Highlights:

| # | Function | Invariants exercised |
|---|---|---|
| 1 | Diagnostic system check (mandatory first) | K |
| 2 | Health + auth + cross-context | — |
| 3 | Syllabus + module-grid scan | — |
| 4 | Integrity-disclosure gate | **J** |
| 5 | Sequential-module gating (out-of-order POST) | **C** |
| 6 | d1 happy path (draft → canvas → submit → poll) | **A, B, G, L** |
| 7 | Sparse-data submission | **E** |
| 8 | Paste-block verification | — |
| 9 | Tutor SSE + critique | **F** |
| 10 | Inline AI actions | — |
| 11 | Multi-submission baseline freeze (needs admin) | **D** |
| 12 | Accommodated-mode (needs admin) | **H** |
| 13 | Admin endpoint enforcement | **I** |
| 14 | Term-paper module (best-effort) | — |
| 15 | Polling badge | L (secondary) |
| 16 | Diagnostic regression (final) | K |
| 17 | Edge cases (empty / malformed / oversized / logged-out) | — |
| 18 | Aggregate processScore leak audit (run-wide) | **A** (final pass) |

## The 12 invariants

**A — Live `processScore` endpoint NEVER leaks features.** Response body
must contain ONLY `score` and `class`. Any other key (feature names, or any
`__baseline*` key) is a CRITICAL VIOLATION — this is the tuning oracle that
would let cheaters refine their attack until they pass.

**B — Student-facing `/api/submissions` responses strip `process*` columns.**

**C — Sequential gating returns 403 with missing-IDs list.**

**D — `processBaseline` freezes at n=2** (verified across 3+ submissions).

**E — Sparse-data guard sets `process*` columns to null** (events<20 OR chars<80).

**F — Tutor SSE stream terminates cleanly** AND both turns persist.

**G — Draft Workshop locks after first feedback.**

**H — Accommodated mode bypasses live monitoring but still submits.**

**I — Admin endpoints return 403 for non-admin.**

**J — Integrity disclosure modal gates module access.**

**K — Diagnostic synthetic-forensics calibration checks pass** (checks 9, 10).

**L — Submission hot path returns 201 before background AI check completes**,
and `aiStatus` eventually transitions out of `pending`.

## Admin path

R1-v2 needs admin privilege for invariants D, H, and the success-path of I.
It tries three strategies in order:

1. If `R1_ADMIN_EMAIL` env var is set, R1-v2 logs in as that email (must
   already be marked `is_admin=true` in the DB).
2. Otherwise R1-v2 creates a fresh `r1-admin-<timestamp>@beta.local` account
   and calls `POST /api/admin/bootstrap`. Per `admin.ts:10` this only
   succeeds if no admin exists in the DB yet.
3. If neither works, R1-v2 logs the partial-verification reason in the
   report and continues. The denial-path of invariant I is still tested.

## Configuration

All env vars are optional except Anthropic credentials.

```
APP_URL                                 default http://localhost:80
APP_BASE                                default '' (root mount)
API_URL                                 default http://localhost:8080
HEADLESS                                default false (true in CI)
MAX_MODULES                             default 3   (cap on per-module functions)
TYPE_DELAY_MS                           default 15  (forensic event cadence)
LIVE_VIEW_PORT                          default 7777
SKIP_FUNCTIONS                          comma-sep list, e.g. "11,12,14,17"
TUTOR_TIMEOUT_MS                        default 60000
AI_CHECK_POLL_TIMEOUT_MS                default 60000
R1_ADMIN_EMAIL                          optional, see "Admin path" above
ANTHROPIC_MODEL                         default claude-sonnet-4-5
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE   Replit-provided chromium binary path

# Anthropic credentials (one of these is required):
ANTHROPIC_API_KEY                       direct
AI_INTEGRATIONS_ANTHROPIC_BASE_URL      + AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit-managed proxy)
```

## Outputs (`runs/<timestamp>/`)

| File | Purpose |
|---|---|
| `report.html` | Self-contained, grouped by function, sticky TOC, no collapses |
| `failures.md` | CRITICAL INVARIANT VIOLATIONS first, then judge concerns |
| `run-summary.txt` | One-glance stats, per-invariant violation counts |
| `transcript.jsonl` | One JSON line per interaction, full detail |
| `network.log` | JSONL of every `/api/*` request + response body |
| `console.log` | Full stdout |
| `screenshots/` | Numbered PNGs (3 per interactive step, 1 per nav) |
| `sse-streams/` | Per-tutor-message SSE event sequences |
| `outputs/diagnostics/` | `system-before.json`, `system-after.json`, `functional-*` |
| `outputs/submissions/` | Full submission records by `<moduleId>-<id>.json` |
| `outputs/process-scores/` | Every live `processScore` response (Invariant A audit trail) |
| `outputs/student-facing-responses/` | Every `/api/submissions` + `/module/:id` for Invariant B |
| `outputs/baseline-snapshots/` | Admin-fetched student records for Invariant D |
| `outputs/tutor-conversations/` | Captured conversations |
| `outputs/accommodated-mode-check.json` | Network log during accommodated typing (Invariant H) |
| `outputs/admin-access-matrix.json` | Per-endpoint per-role access result (Invariant I) |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Clean run |
| 1 | Judge concerns raised (non-critical) |
| 2 | One or more CRITICAL INVARIANT VIOLATIONS |
| 3 | Harness sanity failed (R1-v2 itself didn't do real work) |
