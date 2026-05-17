# R1 — Synthetic Student Beta-Tester

Standalone Node project (NOT in the pnpm workspace) that drives Philosophy 101
end-to-end through a real Chromium browser, types every keystroke, submits real
assignments, and produces a forensic report per run.

See `R1_BLUEPRINT.md` for the complete reference. This file is the quick-start.

## Install

```bash
cd tools/r1
npm install
```

On Replit the Chromium binary is pre-installed and pointed to by
`$REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`; the harness picks it up automatically.
Outside Replit, run `npx playwright install chromium` once.

## Run

```bash
# Smoke (2 modules, ~8–12 min headless)
MAX_MODULES=2 HEADLESS=true npm start

# Full sweep (all modules, ~50–70 min)
npm start
```

Live dashboard while a run is in progress: <http://localhost:7777>

## Required environment

R1 hits the app through the **shared proxy** at `APP_URL` (default
`http://localhost:80`) — never the Vite dev port. It needs Anthropic
credentials via either of:

- `ANTHROPIC_API_KEY` (direct), or
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` (+ optional
  `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) for the Replit-managed proxy.

If neither is present, R1 refuses to start.

## Output

Per-run folder under `runs/<ISO-timestamp>/`:

| file | what it is |
| --- | --- |
| `run-summary.txt` | three (or four) lines — see blueprint PART 4.6 |
| `report.html` | self-contained evidence dump, sticky TOC, no collapses |
| `failures.md` | filtered: CRITICAL invariants + judge concerns |
| `transcript.jsonl` | one JSON record per interaction |
| `network.log` | every `/api/*` call with full bodies |
| `console.log` | full stdout tee |
| `screenshots/` | `NNNN-{before,typed,after}.png` per interaction |

Exit codes: `0` success, `2` fatal harness error, `3` sanity-check failure
(R1 didn't actually do meaningful work).

## Configuration

| var | default | purpose |
| --- | --- | --- |
| `APP_URL` | `http://localhost:80` | Shared proxy. **Never** the Vite port. |
| `APP_BASE` | `/phil-101` | Path prefix where phil-101 is mounted. |
| `API_URL` | `http://localhost:8080` | Used for URL normalization only. |
| `HEADLESS` | `false` | `true` for CI / Replit workflows. |
| `MAX_MODULES` | `3` | 1..12. Smoke = 2; full = 12. |
| `TYPE_DELAY_MS` | `15` | Per-character delay for `page.keyboard.type`. |
| `LIVE_VIEW_PORT` | `7777` | Live dashboard HTTP port. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Model for both brains. |
| `JUDGE_MODEL` | (same) | Override only the judge's model. |
| `CLAUDE_TIMEOUT_MS` | `120000` | Hard per-call timeout. |
| `R1_EMAIL` | `r1-<unix-ms>@beta.test` | Unique per run by default. |
| `R1_NAME` | `R1 Beta Tester` | Sign-in display name. |
