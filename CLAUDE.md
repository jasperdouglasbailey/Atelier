# CLAUDE.md — Atelier worktree

> **Canonical doctrine lives at:**
> `~/Documents/Claude/Projects/Beetle/CLAUDE.md`
>
> Read that first. It owns: tech stack, fee engine, agent topology, lethal
> trifecta, kill switch (Red/Amber/Green), privacy matrix, doctrine vs
> corpus split, signal library, key people. **Do not duplicate those rules
> here.** When the master changes, this file does not need to.

This file holds only the small set of things specific to *how* code is
authored in this repo (style, file layout, gotchas) — not domain doctrine.

## Project layout (worktree)

```
src/
├── app/(dashboard)/        # owner-facing UI; everything visible
├── app/(portal)/           # FUTURE: artist + crew portals (no client portal — doctrine)
├── app/print/              # print-only quote/invoice templates
├── app/api/                # health + OAuth callbacks (Google, Xero)
├── components/             # client + server React, grouped by domain
├── lib/data/               # one file per table; Supabase queries only
├── lib/integrations/       # Anthropic, Xero, Google (auth/gmail/drive/calendar)
├── lib/automation/         # brief intake, hold requests, approval effects
└── lib/utils/              # fee engine, brief parser, daterange, kill switch...
```

## Code style

- Strict TypeScript, no `any` without a comment explaining why.
- Server components by default. Client components only when needed for interactivity.
- Server actions are the ONLY place mutations happen.
- No emojis in UI / files unless the user explicitly asks.
- Australian spelling in user-facing copy ("organisation", "colour"). US in
  code identifiers ("organization") because that's npm convention.

## Standing checks before declaring "done"

1. `rm -rf .next && npx tsc --noEmit` (clean, zero errors)
2. `npm test` (79+ tests must stay green; add tests when changing pure functions)
3. `grep -rn "TODO\|FIXME\|XXX" src/` for anything new I left behind
4. Search for hardcoded user names / fake data — should be `getCurrentActor()` or env
5. If touching the fee engine, the AJE eComm #3579 canonical example must still pass

## Worktree-specific gotchas

- This is a git worktree, not the main checkout. Changes here need pushing
  to the branch and merged via PR.
- Next.js generates `.next/types/validator.ts` from route folder names. If
  you delete a route folder, run `rm -rf .next` before `tsc --noEmit`.
- Supabase PostgREST builder lacks `.catch()` — use try/catch.
- Postgres daterange end is EXCLUSIVE. Use `src/lib/utils/daterange.ts`.

## Phase order (agreed 2026-05-05)

The work is sequenced so dependencies stack naturally and the Xero block doesn't gate anything else.

1. **Phase 1a — parity + small wins.** ✅ Shipped.
2. **Phase 1b — entity expansion + resilience.** ✅ Shipped (PRs #14, #15, #17 + auto-Drive earlier).
3. **Phase 3 — corpus + Tier 2.** ✅ First slice shipped (PR #18 — precedent signals on booking detail). Tier-2 #13 / #15 still pending clarification.
4. **Phase 4 — agent automation.** ✅ First pass shipped (PR #19 — agent primitives, critique pass on brief-clarify, auto call sheet). Full agent prompt suite (confidence contracts wired into every agent, precedent requirement enforcement) still pending.
5. **Phase 2 — Xero.** ⏳ Blocked on credentials.
6. **Phase 5 — RLS + partner accounts.** ✅ Shipped end-to-end. PR #20 brought the infrastructure (app_users, role helpers, partner UI). Migrations 0018 + 0019 then dropped the legacy `auth_full_access` AND the pre-existing wide-open `*_anon_all` policies (which would have bypassed every other policy — caught during this session), replacing with `is_owner_or_partner()` for admin tables and self-scoped read policies for talent / crew. Owner + partner accounts seeded; Mason and Patrick provisioned as live crew test accounts. Health probes switched to service-role client so monitor uptime checks still work post-lockdown.
7. **Phase 6 — talent / crew portals.** ✅ Shipped (PR ##  — `/portal/talent`, `/portal/crew`, role-based redirect from dashboard).
8. **Phase 7 — production polish.** ⏳ Performance, monitoring, edge cases — ongoing.

## Build status (updated 2026-05-05, session 5)

### Fully built (Phases 1a, 1b, 3 first slice, 4 first pass, 5 first slice, 6 portals)
- Booking pipeline: all 13 states, list + kanban board + month calendar, detail, edit, new
- Quote builder: versioned (v1, v2…), photographer + videographer templates, artist/outgoing split, live total preview, inline row editing (per-line ASF % editable, "Charge 15%" checkbox on add)
- Quote agency-margin breakdown: commission + all ASF + super spread shown on builder
- Usage licences: media × territory × duration, BUR auto-calculator
- Fee engine: 20% commission, 15% ASF, 12/15% super, 10% GST — passes AJE #3579 canonical test
- Brief parser: AI extraction of 15 canonical fields, apply suggestions action
- Brief clarifying email: detects missing fields, LLM-drafts polite follow-up, Gmail draft or clipboard fallback
- Hold requests: auto-propose preferred-core crew, kill-switch gated
- Morning-after checklist + OT/expense entry + 7-day lock cron
- Dashboard: KPI cards, attention queue, health-probe banner (renders only on failure)
- Reports: 12-month revenue bars, state/tier breakdown, top clients, top artists, win rate / quote conversion
- Talent: list, detail (stats + booking history + default day rate), edit (default rate field), archive
- Crew: list, detail (per-person booking history), edit
- Bookings calendar: month grid view at `/bookings?view=calendar` (consolidated from former `/crew-bookings` route)
- Clients: list, detail (revenue KPIs, frequent artists, booking history), edit
- Print templates: quote, invoice, artist brief, crew brief — light-mode forced regardless of app theme
- Send Quote to Client: compose panel, Gmail draft/send, clipboard fallback, state transition quote_drafted → quote_sent
- Public quote viewer `/q/[token]`: auth-free client-facing link, embedded in emails, "Client View" button on booking
- Booking team: talent/crew add forms pre-fill day rate from stored default; migration 0006 adds default_day_rate to talent
- Auto Drive folders for clients/artists/crew on insert (extends Locations pattern)
- Audit log (failure rows shown red), kill switch (Red/Amber/Green), settings
- Google OAuth flow: Gmail search, outbound send/draft, Drive folders, Calendar events
- Artist shown on booking list/board/edit via booking_talent join
- **Resilience pass (Phase 1b PR#14):** `reportDataError()` (throws in dev, logs in prod), generated DB types + compile-time compat assertions, `/api/health?probe=1`, `logAuditFailure()` writes `<action>_failed` rows
- **Hard delete + corpus archival (PR#15):** terminal-state-only `deleteBookingAction()` writes anonymised row to `atelier_corpus_bookings` (sha256-hashed client/talent IDs) before cascade. Action-only, no UI button yet.
- **Magic-link onboarding (PR#17):** "Send onboarding link" button on talent/crew detail pages emails a 14-day URL to `/onboard/[token]`; recipient sees pre-filled form to update name, contact, ABN, super, address, DOB, default day rate. `submitOnboardingAction` marks `onboarding_completed=true` but leaves `is_active` for owner sign-off.
- **Phase 3 precedent signals (PR#18):** `<PrecedentSignals>` panel on booking detail surfaces talent rate band, client total band, talent-client prior work, and corpus signal. Sample-size guard (n<3 = "thin data") implemented at the data layer.
- **Phase 4 agent primitives (PR#19):** `agent-primitives.ts` exports `JASPER_VOICE_RULES`, `critiqueDraft()`, `buildConfidenceContract()`, `formatPrecedentCitation()`. Brief-clarify email now runs through critique pass with up to 2 attempts. Auto call-sheet at `/print/bookings/[id]/call-sheet`.
- **Phase 5 partner accounts (PR#20):** `atelier_app_users` table + `current_app_role()` / `is_owner_or_partner()` SQL helpers. `/settings/partners` admin UI to provision owner / partner / talent / crew roles. Jasper, Jemma, Gary already seeded with owner/partner roles.
- **Phase 6 portals (this PR):** `/portal/talent` and `/portal/crew` with own profile, upcoming + past bookings, day rate, compliance hints. Dashboard layout redirects talent/crew users to their portal automatically.

### In progress / partially wired
- Gmail outbound: wired, needs GOOGLE_REFRESH_TOKEN credentials set
- Xero: OAuth registered; **invoice sync not yet live** (Phase 2, awaiting credentials)
- Quote templates: photographer + videographer; no usage/grading/equipment lines yet
- Repeat-client autofill on new booking: in progress

### Deferred to follow-up PRs
- **RLS lockdown (Phase 5b)** — the `atelier_app_users` infrastructure is live and roles are seeded, but the existing `auth_full_access` RLS policy is intentionally not yet replaced. Once Jasper has confirmed talent/crew portals work end-to-end (we'd need to provision a real talent/crew test account first), the lockdown migration drops `auth_full_access` and replaces it with `is_owner_or_partner()` for full access plus per-table scoped policies for talent (own row + own booking_talent + own bookings) and crew (mirror).
- **Tier-2 features #13 / #15** — numbered list reference unclear; needs a quick sync with Jasper.
- **Phase 2 (Xero)** — blocked on credentials.
- **Phase 7 (production polish)** — performance, monitoring, edge cases. Standing checklist: tsc clean, tests green, no TODO/FIXME left behind, no hardcoded names/data, AJE eComm #3579 canonical test still passes.

## When in doubt

If the master CLAUDE.md and this file disagree, the master wins. If the
master is silent, ask Jasper — don't guess.
