# Philosophy 101 — AI-Powered Online Course

A complete online college course shell for **PHIL 101: Introduction to Philosophy**, built to satisfy the [Quality Matters Higher Education Rubric, 7th Edition](https://www.qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric) (Specific Review Standards 1.1 – 8.7). The course is taught by an AI Tutor powered by **Anthropic Claude Sonnet 4.5** that speaks for the instructor of record (Dr. Lawrence Dodge) and conducts Socratic dialogue with each student.

The full QM crosswalk is in [`qm_crosswalk.md`](./qm_crosswalk.md).

---

## What's in the course

- **7 pages**: Start Here, Syllabus, Modules, AI Tutor, Assessments, Support, Accessibility.
- **13 sequential modules**, gated so each unlocks once the previous is submitted (override with `?admin=true`). All curriculum text is loaded **verbatim** from the source textbook (`Clean_Phil_101_Dodge_Book.docx`):
  1. Discussion 1 — Branches of Philosophy
  2. Essay 1 — Empirical vs Philosophical Questions
  3. Discussion 2 — Plato's Cave
  4. Essay 2 — Empiricism vs Rationalism
  5. Discussion 3 — Logical Fallacies
  6. Essay 3 — Inductive vs Deductive Reasoning
  7. Discussion 4 — Free Will
  8. Essay 4 — Personal Identity
  9. Discussion 5 — The Existence of God
  10. Essay 5 — The Problem of Evil
  11. Discussion 6 — Utilitarianism vs Deontology
  12. Discussion 7 — The Ring of Gyges
  13. Term Paper — Applied Ethics
- **AI Tutor** with persistent, per-module conversation history. Streams responses via Server-Sent Events. System-prompted to teach Socratically and refuse to write assignments for students.
- **Practice Critique** tool: the AI generates a deliberately mediocre answer that the student critiques (active-learning self-check).
- **Submission tracking** with database persistence.

---

## Architecture

This is a pnpm monorepo (`pnpm-workspace.yaml`) with three relevant artifacts:

```
artifacts/
├── api-server/      # Express 5 + Drizzle ORM + Anthropic SDK (port 8080, mounted at /api)
├── phil-101/        # React + Vite + shadcn/ui + wouter (mounted at /)
└── mockup-sandbox/  # Design canvas (not used in the live course)

lib/
├── api-spec/                    # OpenAPI 3.1 contract — source of truth
├── api-zod/                     # Generated Zod validators (used by the server)
├── api-client-react/            # Generated React Query hooks (used by the client)
├── db/                          # Drizzle schema + Postgres client
└── integrations-anthropic-ai/   # Anthropic SDK wrapper (uses Replit AI integration)
```

### Stack

- **Backend**: Express 5, TypeScript, Drizzle ORM, PostgreSQL, Pino logging, HMAC-signed session cookies (`SESSION_SECRET`).
- **AI**: `@anthropic-ai/sdk` via the Replit Anthropic integration (model `claude-sonnet-4-5`). Streaming chat via `messages.stream`.
- **Frontend**: React 18, Vite, TypeScript, wouter, TanStack Query, shadcn/ui (Radix primitives), Tailwind, lucide-react.
- **API contract**: OpenAPI 3.1 → Orval generates both the React Query hooks and the Zod validators in one pass.

### Database tables (`lib/db/src/schema.ts`)

- `students` — id, email (unique), name, intro, createdAt
- `submissions` — id, studentId, moduleId, content, createdAt
- `tutor_conversations` — id, studentId, moduleId (one per pair)
- `tutor_messages` — id, conversationId, role, content, createdAt

### Key API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/api/healthz` | Liveness |
| POST | `/api/auth/login` | Login or auto-register by email + name |
| POST | `/api/auth/logout` | Clear session cookie |
| GET  | `/api/auth/me` | Current student |
| GET  | `/api/progress` | Completed modules + intro text |
| POST | `/api/progress/intro` | Save self-introduction |
| GET  | `/api/submissions` | List the student's submissions |
| POST | `/api/submissions` | Submit a module |
| GET  | `/api/submissions/module/:moduleId` | Latest submission for a module |
| GET  | `/api/tutor/:moduleId/conversation` | Load tutor history |
| POST | `/api/tutor/:moduleId/message` | Send message — **streams SSE** |
| POST | `/api/tutor/:moduleId/critique` | Generate a mediocre answer for the Practice Critique tool |

---

## Running locally

This project runs in Replit; both artifacts start as workflows. Manually:

```bash
# typecheck everything
pnpm run typecheck

# regenerate API hooks + Zod schemas after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# run the API server (port 8080, served behind /api)
pnpm --filter @workspace/api-server run dev

# run the web app (Vite, served at /)
pnpm --filter @workspace/phil-101 run dev
```

In Replit, use **Restart Workflow** for `artifacts/api-server: API Server` and `artifacts/phil-101: web` instead of running these commands directly.

### Required environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (provided by Replit) |
| `SESSION_SECRET` | HMAC key for session cookies |
| `ANTHROPIC_*` (provided by integration) | Anthropic API access via the Replit AI integration — no key handling required |

---

## Academic integrity & AI policy

- The AI Tutor is explicitly system-prompted to refuse to write assignments for students.
- Every tutor message and every submission is persisted to the database, so the human instructor of record can audit engagement.
- The on-app policy is stated on the Start Here page and the Syllabus page, and is referenced in `qm_crosswalk.md`.

## Accessibility

WCAG 2.1 AA-targeted. Built on Radix UI primitives, semantic HTML, full keyboard navigation, visible focus rings, ARIA labels on all interactive controls. Vendor accessibility statements and the keyboard map are linked from `/accessibility`.

## Deployment

The pnpm monorepo deploys via Replit Deployments. The `api-server` artifact builds to a single CJS bundle (`esbuild`) and serves on `PORT`. The `phil-101` artifact builds to static assets (`vite build`) and is served by Replit's static rewriter. Path-based routing is handled by the Replit reverse proxy per `artifact.toml`.
