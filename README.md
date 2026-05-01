# Atelier

Production management for an Australian commercial photography agency. Next.js 16 (App Router) + Supabase + TypeScript.

## Stack

- **Next.js 16** App Router, React 19, server actions, server components by default
- **Supabase** (`@supabase/ssr`) — Postgres, RLS, all tables prefixed `atelier_`
- **Tailwind v4** + a custom dark-themed palette (`src/lib/utils/constants.ts`)
- **Anthropic Claude** for brief-intake extraction (Haiku for cost), via a thin wrapper at `src/lib/integrations/anthropic.ts` with kill-switch, idempotency, and cost tracking
- **Vitest** for unit tests of the fee engine, brief parser, and daterange round-trips

## Getting started

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_* at minimum
npm install
npm run dev
```

Open <http://localhost:3000>. The app is currently open (no auth).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (~80 tests, runs in <1s) |
| `npm run test:watch` | Vitest in watch mode |
| `npx tsc --noEmit` | Strict TypeScript check |

## Architecture

```
src/
├── app/
│   ├── (dashboard)/         # all authenticated UI
│   ├── print/               # quote + invoice print views (light theme)
│   ├── api/                 # health check + OAuth callbacks
│   └── actions/             # server actions (the only place mutations happen)
├── components/              # client + server React components, grouped by domain
├── lib/
│   ├── data/                # database queries (one file per domain)
│   ├── integrations/        # Anthropic, Xero, Google (Gmail/Drive/Calendar) wrappers
│   ├── automation/          # brief intake, hold requests, approval effects
│   └── utils/               # fee engine, brief parser, daterange, kill switch...
└── middleware.ts            # session refresh (auth enforcement TBD)
```

### Doctrine — non-obvious rules locked in code

- **Approval queue**: every agent-initiated mutation (sending crew holds, generating quotes, emailing clients) is queued as an `atelier_approvals` row. Jasper approves or rejects from `/inbox`. Side-effects run *after* approval via `src/lib/automation/approval-effects.ts`.
- **Kill switch**: a single boolean in the DB blocks all LLM calls and outbound integrations. Visible at the top of every page; toggleable from `/settings`.
- **Cost cap**: monthly LLM spend cap in `src/lib/utils/constants.ts`. The wrapper refuses calls that would exceed it and records every call to `atelier_llm_calls`. View at `/costs`.
- **Idempotency**: `src/lib/utils/idempotency.ts` + `atelier_idempotency_keys` table prevents the same agent action firing twice (e.g. retried hold-request emails).
- **Pay-on-paid**: artist/crew bills are only created in Xero *after* the client invoice is marked paid. See `src/lib/integrations/xero.ts` (currently stub).
- **Postgres `daterange`**: stored ranges have an *exclusive* upper bound. Use `src/lib/utils/daterange.ts` helpers for any conversion to/from form inputs — never roll your own.

## Auth

There is no login flow yet. `src/middleware.ts` lets every request through and `src/lib/utils/actor.ts` returns a hardcoded `'jasper'` for audit-log entries. When Supabase Auth is wired up:

1. Add a `/login` page
2. In `middleware.ts`, replace the `// AUTH ENFORCEMENT HERE` marker with a redirect-if-unauthed check
3. Update the body of `getCurrentActor()` in `src/lib/utils/actor.ts` to read from the session

Every call site already awaits `getCurrentActor()`, so the swap is one file.

## Integrations

| Integration | Status | Required env |
|---|---|---|
| Anthropic | Production-ready (graceful no-op without key) | `ANTHROPIC_API_KEY` |
| Xero | Stub (logs + returns fake IDs) | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_TENANT_ID` |
| Google (Gmail · Drive · Calendar) | Stub with working OAuth flow | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |

The Google integration is one OAuth grant covering all three services (`gmail.send/modify/readonly`, `drive.file`, `calendar.events`). To set up: complete the steps in `.env.example`, then visit `/api/auth/start/google` to grant consent. The callback at `/api/auth/callback/google` surfaces the refresh token to paste into env. Source files: `src/lib/integrations/google-auth.ts` (shared OAuth + token refresh), `gmail.ts`, `drive.ts`, `calendar.ts`.

`drive.file` (NOT full `drive`) is a deliberate scope choice — the app can only see files it created itself, which is exactly enough for booking folders without spooking Workspace admins or Google's verification process.

Xero callback lives at `src/app/api/auth/callback/xero` — still a placeholder.

## Database

Single migration in `supabase/migrations/0001_atelier_init.sql`. Tables (all prefixed `atelier_`): bookings, clients, brands, talent, crew, campaigns, booking_talent, booking_crew, quote_versions, fee_lines, usage_licences, approvals, audit_log, llm_calls, idempotency_keys, kill_switch.

## Testing

Run `npm test`. Coverage focuses on pure functions where silent regression is most expensive:

- **Fee engine** (`src/lib/utils/fee-engine.test.ts`) — anchored to the canonical Oliver AJE eComm #3579 worked example. Verifies commission, ASF, GST, super, OT calculations.
- **Brief parser** (`src/lib/utils/brief-parser.test.ts`) — date ranges (single, multi-day, numeric, TBC), budget extraction with sanity bounds, talent count with gender/age modifiers, deliverables type detection, usage duration.
- **Daterange round-trip** (`src/lib/utils/daterange.test.ts`) — Postgres exclusive-upper-bound conversion, including month/year/leap-year boundaries.

CI runs typecheck + lint + tests on every PR (`.github/workflows/ci.yml`).
