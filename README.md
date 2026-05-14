# Atelier

Production management for an Australian commercial photography agency (Saunders & Co). Next.js 16 (App Router) + Supabase + TypeScript. Live at <https://atelier.saundersandco.com.au>.

## Stack

- **Next.js 16.2** App Router, React 19, server actions, server components by default
- **Supabase** (`@supabase/ssr`) — Postgres, RLS, all tables prefixed `atelier_`
- **Tailwind v4** + a custom dark-themed palette (`src/lib/utils/constants.ts`)
- **Anthropic Claude** for brief-intake extraction (Haiku for cost), via a thin wrapper at `src/lib/integrations/anthropic.ts` with kill-switch, idempotency, and cost tracking
- **Puppeteer + @sparticuz/chromium** for serverless PDF rendering of quotes, invoices, confirmations
- **Recharts** for the dashboard / reports KPI graphs
- **Vitest** — 164 tests across the fee engine, brief parser, daterange round-trips, and tone-variant builders

## Getting started

Requires Node 20+ and a Supabase project.

```bash
# 1. Clone + install
git clone <repo> && cd Atelier
npm install

# 2. Environment
cp .env.local.example .env.local   # if you have it; otherwise create .env.local manually
# Required at minimum:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
# Optional but recommended:
#   ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN
#   AGENCY_NAME, AGENCY_EMAIL, AGENCY_ABN, AGENCY_ADDRESS
#   CRON_SECRET (any strong random string)

# 3. Apply migrations
# Either via Supabase CLI:
supabase db push
# Or paste each file in supabase/migrations/ into the Supabase SQL editor in order.

# 4. Seed an owner so you can actually log in
# In Supabase SQL editor:
INSERT INTO atelier_app_users (email, role) VALUES ('you@example.com', 'owner');

# 5. Run
npm run dev
```

Open <http://localhost:3000> → redirected to `/login` → enter the email you seeded → click the magic link in your inbox.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (~5s, 164 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:types` | Regenerate `src/lib/types/database.generated.ts` from the live schema |
| `npx tsc --noEmit` | Strict TypeScript check |

## Architecture

```
src/
├── app/
│   ├── (dashboard)/         # owner + partner UI (gated by app_users role)
│   ├── portal/
│   │   ├── talent/          # talent self-service portal
│   │   └── crew/            # crew self-service portal
│   ├── onboard/             # /onboard (open) + /onboard/[token] (magic-link)
│   ├── q/[token]/           # public client quote viewer (token-gated, no auth)
│   ├── login/               # magic-link sign-in
│   ├── privacy/             # public privacy policy (APP-aligned)
│   ├── print/               # quote, invoice, confirmation, briefs, call sheet (light theme)
│   ├── api/                 # health, OAuth callbacks, cron, PDF endpoints, /api/onboard, etc.
│   └── actions/             # server actions — the only place mutations happen
├── components/              # client + server React, grouped by domain
├── lib/
│   ├── data/                # Supabase queries (one file per table)
│   ├── integrations/        # anthropic, xero, gmail, drive, calendar, google-auth
│   ├── automation/          # brief-intake, hold-requests, approval-effects, agent-primitives
│   └── utils/               # fee engine, brief parser, daterange, kill switch, audit, health…
├── middleware.ts            # session refresh + auth enforcement
supabase/
└── migrations/              # 47 SQL migrations, applied in order
```

### Doctrine — non-obvious rules locked in code

- **Approval queue**: every agent-initiated mutation (sending crew holds, generating quotes, emailing clients) is queued as an `atelier_approvals` row. Owner approves or rejects from `/inbox`. Side-effects run *after* approval via `src/lib/automation/approval-effects.ts`.
- **Kill switch**: a single boolean in the DB blocks all LLM calls and outbound integrations. Visible at the top of every page; toggleable from `/settings`.
- **Cost cap**: monthly LLM spend cap in `src/lib/utils/constants.ts`. The wrapper refuses calls that would exceed it and records every call to `atelier_llm_calls`. View at `/costs`.
- **Idempotency**: `src/lib/utils/idempotency.ts` + `atelier_idempotency_keys` table prevents the same agent action firing twice (e.g. retried hold-request emails).
- **Pay-on-paid**: artist/crew bills are only created in Xero *after* the client invoice is marked paid. (Xero still a stub — gates the workflow client-side until credentials land.)
- **Postgres `daterange`**: stored ranges have an *exclusive* upper bound. Use `src/lib/utils/daterange.ts` helpers — never roll your own.
- **Fee engine rules (canonical, locked 2026-05-14)**: full table in `CLAUDE.md`. Summary: 20% commission on artist labour only; 15% ASF default on every line; 15% super charged / 12% paid on `crew_labour` only; GST always on for equipment regardless of payee.
- **Reimbursements**: commissionable lines can never be flagged reimbursement — enforced in QuoteBuilder, AddLineForm, and server-side coercion in `addFeeLineAction` / `updateFeeLineAction`.
- **Service-client writes**: mutations bypass RLS via `src/lib/supabase/service.ts` after action-layer auth via `requireOwnerOrPartner()`. Reads use the auth-context client.

## Auth & roles

- Magic-link sign-in via Supabase Auth at `/login`. The middleware redirects unauthenticated requests to `/login`.
- Roles live in `atelier_app_users` (`owner` | `partner` | `talent` | `crew`). Helpers: `getCurrentActor()`, `getCurrentAppUser()`, `requireOwnerOrPartner()` in `src/lib/utils/`.
- `(dashboard)` routes gate on owner/partner. `portal/talent` and `portal/crew` route the corresponding roles to their own self-service UIs. The dashboard layout auto-redirects talent/crew sessions to their portal.
- Public surfaces: `/q/[token]` (client quote viewer, token + 180-day expiry), `/onboard/[token]` (magic-link onboarding for new talent/crew), `/privacy`, `/login`.
- RLS lockdown: `is_owner_or_partner()` SQL helper gates admin tables; `atelier_bookings_portal` view exposes only 15 safe columns to attached talent/crew (financial totals stay invisible).

## Integrations

| Integration | Status | Required env |
|---|---|---|
| Anthropic | Production (graceful no-op without key) | `ANTHROPIC_API_KEY` |
| Google (Gmail · Drive · Calendar) | Production | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Xero | Stub — OAuth callback wired, invoice sync pending credentials | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` |

One Google OAuth grant covers all three services (`gmail.send/modify/readonly`, `drive.file`, `calendar.events`). To set up: visit `/api/auth/start/google` to grant consent, paste the refresh token from the callback into env. Source: `src/lib/integrations/{google-auth,gmail,drive,calendar}.ts`.

`drive.file` (NOT full `drive`) is a deliberate scope choice — the app can only see files it created itself, which is exactly enough for booking folders without spooking Workspace admins or Google's verification.

## Cron jobs

Scheduled via `vercel.json`, gated by per-cron secrets (`src/lib/utils/cron-auth.ts`):

- `02:00 AEST` — lock OT windows after 7 days
- `06:00 AEST` — tomorrow's-shoot digest email to producer
- `07:00 AEST` — post-shoot client chase (day 7/14/22/30)
- `08:30 AEST` — quote chase (day 3/7/14/21 stuck in `quote_sent`)
- `09:00 AEST` — compliance pings (talent/crew passports, licences, WWCCs, visas; business renewals)
- `04:15 AEST` — auto-anonymise per APP 11.2 (7-year retention)
- daily — data-retention sweep (expire pending approvals >30d, purge `atelier_llm_calls` >90d)

All comms crons queue approval-gated drafts; nothing sends without owner sign-off.

## Database

47 migrations in `supabase/migrations/`, applied in order. Apply with `supabase db push` or by pasting each file into the Supabase SQL editor.

Tables (all prefixed `atelier_`): `app_users`, `bookings`, `clients`, `brands`, `talent`, `crew`, `campaigns`, `booking_talent`, `booking_crew`, `booking_schedules`, `quote_versions`, `fee_lines`, `usage_licences`, `approvals`, `audit_log`, `llm_calls`, `idempotency_keys`, `kill_switch`, `locations`, `corpus_bookings`, `talent_preferred_crew`, `talent_unavailability`, `crew_unavailability`, `tasks`, `business_renewals`, plus the `atelier_bookings_portal` view for column-restricted reads.

Regenerate types after schema changes:

```bash
npm run db:types
```

Then update `src/lib/types/database.ts` hand-types to match — both layers must move together (see CLAUDE.md "Schema change ripple").

## Testing

Run `npm test`. 164 tests / 11 files / ~5s. Coverage focuses on pure functions where silent regression is most expensive:

- **Fee engine** (`src/lib/utils/fee-engine.test.ts`) — anchored to the canonical AJE eComm #3579 worked example. Verifies commission, ASF, GST, super, OT calculations across every line type.
- **Brief parser** (`src/lib/utils/brief-parser.test.ts`) — date ranges (single, multi-day, numeric, TBC), budget extraction with sanity bounds, talent count with gender/age modifiers, deliverables type detection, usage duration.
- **Daterange round-trip** (`src/lib/utils/daterange.test.ts`) — Postgres exclusive-upper-bound conversion, including month/year/leap-year boundaries.
- **Tone variants** (`src/lib/utils/comms-tone.test.ts`) — formal / casual / terse register builders for automated client emails.
- **Title-case** (`src/lib/utils/title-case.test.ts`) — uniform vs mixed-case name handling for CSV imports.

CI runs typecheck + lint + tests on every PR (`.github/workflows/ci.yml`). The `check` job must be green before merging.

## Deployment

Vercel auto-deploys `main` to <https://atelier.saundersandco.com.au>. Migrations do NOT auto-apply — they're a manual step via Supabase MCP or `supabase db push`. Set env vars in the Vercel dashboard; cron secrets are checked per-route by `cron-auth.ts`.

## Where to start reading

- `CLAUDE.md` — the canonical project doctrine. Start here. Build status, phase order, fee rules, dev discipline.
- `src/app/(dashboard)/bookings/[id]/page.tsx` — the main booking detail page; touches almost every subsystem.
- `src/app/actions/quotes.ts` — fee-line mutations + canonical defaults (`lineTypeDefaults()`).
- `src/components/quotes/QuoteBuilder.tsx` — the heaviest piece of UI; everything fee-related funnels through here.
- `src/lib/automation/approval-effects.ts` — every approval-gated action's side-effect handler lives here.
