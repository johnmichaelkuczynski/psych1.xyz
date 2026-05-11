# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Required env vars

- `DATABASE_URL` — Postgres
- `SESSION_SECRET` — express-session
- `GPTZERO_API_KEY` — AI-detection scoring on every student submission. If absent, submissions still succeed; their `aiStatus` is recorded as `failed`.

## Architecture decisions

- AI-detection (GPTZero) runs **after** insert in a fire-and-forget background task in `routes/submissions.ts`; the POST returns immediately with `aiStatus: "pending"`. The web client polls `GET /submissions/module/:id` (and the assessments list) every 2–2.5s while any submission is still pending. If a submission carries `finalAiScore` from the live canvas, the background check is skipped. See `artifacts/api-server/src/lib/gptzero.ts` and `artifacts/phil-101/src/components/ai-score-badge.tsx`.
- **Integrity Canvas** (per assignment): two-box workflow on `/modules/:id`. Box 1 (`draft-workshop.tsx`) — single-shot AI feedback in 5 sections; once feedback is fetched the draft is locked (`assignment_drafts` table). Box 2 (`integrity-canvas.tsx`) — paste-blocked contentEditable+overlay editor, real-time GPTZero scoring (debounced ≥30 chars / 200-char bursts) with sentence-level highlighting, autosave every 5s to `canvas_sessions`, full keystroke log, traffic-light bar, and a 30-s cumulative-red warning. Submit on red prompts a confirm dialog; submission ships with `keystrokes`, `scoreHistory`, `finalAiScore`, `flaggedOnSubmit`. The server computes an `activityReport` (`lib/activityReport.ts`) on insert. Accommodated students (admin toggle) get a plain textarea and skip monitoring.
- **One-time integrity disclosure**: shown via `IntegrityDisclosureGate` modal on first module page load. `students.integrityAckAt` defaults to epoch 0; gate treats epoch as "not acked". Acknowledgment via `POST /api/integrity/ack`.
- **Admin dashboard** at `/admin/submissions` (+ `/admin/submissions/:id`): list/replay/sparkline/activity-report; accommodation toggle per student. First authenticated user can claim admin via `POST /api/admin/bootstrap`; subsequent admin status is granted only by an existing admin. `requireAdmin` middleware in `artifacts/api-server/src/middleware/requireAdmin.ts`.
- **Writing-process forensics** (second AI-detection layer, independent of GPTZero): scores the SHAPE of a writing session (timing uniformity, deletion ratio, structural edits, caret backtracks, abandoned starts, burst length variation, sentence/paragraph pauses, front-to-back linearity, sustained typing rate). Pure analyzer in `artifacts/api-server/src/lib/processForensics.ts` — no I/O, no DB, no env — so it can be exercised by the synthetic diagnostic tests. The integrity canvas emits BOTH legacy `{k,d}` events (preserved for the activity report) AND new rich `{type, len, caretBefore, caretAfter, text, charCount}` events the analyzer reads. On submit (`routes/submissions.ts`) the analyzer runs against the keystroke log, persists `processScore` (0–100), `processClass` ("human" / "mixed" / "likelyAI"), `processFeatures` (with `__baselineAdjustedScore`/`__baselineDeviation`/`__baselineSnapshot`/`__baselineN` stashed in the same jsonb), and `processFlags`. Each student has a per-student baseline (`students.processBaseline`) that is folded in for the first 2 submissions and then **frozen at n=2** to prevent slow-drift training attacks. Sparse data (<20 events OR <80 chars) skips analysis entirely. The student-facing canvas shows a second traffic-light bar wired to `POST /canvas/:moduleId/processScore` (returns ONLY `{score, class}` — no feature names ever reach the client) and is throttled to once per 60s on the frontend. Student-facing list/get endpoints already strip the new columns via the existing api-zod schemas. The integrity disclosure modal is intentionally generic and does NOT name this layer. Two synthetic end-to-end checks live in `routes/diagnostic.ts` ("synthetic transcription scores as likelyAI", "synthetic composition scores as human") and run as part of `/api/diagnostic/system`. Admin panel renders a `ProcessForensicsView` (per-feature values, baseline snapshot, deviation %, and human-readable flags) hidden from students.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
