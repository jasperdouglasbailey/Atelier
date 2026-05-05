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

1. **Phase 1a — parity + small wins.** Tier-1 quick fixes (#2 / #3 / #4 / #7-partial)
   plus the parity work (BookingFormFields, edit-form parity, quote regen, autofill). ✅ Shipped.
2. **Phase 1b — entity expansion + resilience.** New fields on existing entities,
   hard delete, magic-link onboarding (#6), auto Drive folders (#7 full),
   plus the resilience pass (loud failures, generated types, health probes,
   audit failures). ✅ Mostly shipped — magic-link onboarding still open.
3. **Phase 3 — corpus + Tier 2.** Corpus consumers (rate precedents, repeat-client
   pattern detection), Tier-2 features #13 / #15. Corpus *table* and write-on-delete
   shipped early in 1b/PR#15; Phase 3 is the read side.
4. **Phase 4 — agent automation.** Confidence contracts, critique passes,
   Tier-3 #17, auto call-sheet (#10).
5. **Phase 2 — Xero.** Deferred until credentials land; touches no other phase
   so order doesn't matter beyond unblocking.
6. **Phase 5 — RLS + partner accounts.** Privacy matrix at the DB layer,
   then Jemma / Gary multi-user.
7. **Phase 6 — talent / crew portals.** Lighter than originally scoped because
   onboarding moved up to 1b.
8. **Phase 7 — production polish.** Performance, monitoring, edge cases.

## Build status (updated 2026-05-05, session 4)

### Fully built (Phase 1a + most of 1b)
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

### In progress / partially wired
- Gmail outbound: wired, needs GOOGLE_REFRESH_TOKEN credentials set
- Xero: OAuth registered; **invoice sync not yet live** (Phase 2, awaiting credentials)
- Quote templates: photographer + videographer; no usage/grading/equipment lines yet
- Repeat-client autofill on new booking: in progress

### Phase 1b — still open
- **Magic-link onboarding (#6)** — talent/crew can set their own default day rate, address, ABN, super fund via emailed link
- **Entity expansion fields** — list TBD with Jasper (e.g. crew tier override, talent travel preferences)

### Phase 3+ — not yet built
- Corpus *consumers* (rate precedents UI, repeat-client signal surfacing) — table exists from Phase 1b, no readers yet
- Signal surfacing: DOI drift, rate delta, talent-client history inline on bookings
- Tier-2 #13 / #15
- Full agent prompts: confidence contracts, critique passes, precedent requirements
- Tier-3 #17, auto call-sheet (#10)
- RLS enforcement (privacy matrix at DB layer)
- Partner accounts (Jemma, Gary multi-user)
- Talent / crew portals
- Production polish

## When in doubt

If the master CLAUDE.md and this file disagree, the master wins. If the
master is silent, ask Jasper — don't guess.
