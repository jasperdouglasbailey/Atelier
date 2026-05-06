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
├── app/(dashboard)/        # owner-facing UI; gated by app_users role check
├── app/portal/             # talent + crew portals (no parens — public route group)
│   ├── talent/             # /portal/talent — own profile, own bookings, own rate
│   └── crew/               # /portal/crew  — own profile, own bookings, own role
├── app/onboard/            # /onboard (open self-service) + /onboard/[token] (magic-link)
├── app/q/[token]/          # public quote viewer (no auth, token-gated)
├── app/print/              # print-only templates: quote, invoice, artist brief, crew brief, call sheet
├── app/api/                # health, OAuth callbacks (Google, Xero), cron, sign-out, /api/onboard, /api/instagram, import/export
├── app/login/              # magic-link sign-in
├── components/             # client + server React, grouped by domain
├── lib/data/               # one file per table; Supabase queries only
├── lib/integrations/       # anthropic, xero, gmail, google-auth, drive, calendar
├── lib/automation/         # brief-intake, hold-requests, approval-effects, agent-primitives
└── lib/utils/              # fee engine, brief parser, daterange, kill switch, audit, health, etc.
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
6. **Memory sync — non-negotiable.** Every PR that ships, before declaring done, re-read all of these files and update anything that's now wrong:
   - This file (worktree `CLAUDE.md`) — Build status, Phase order, Deferred / blocked, Forward roadmap, Project layout
   - Master `~/Documents/Claude/Projects/Beetle/CLAUDE.md` — if doctrine, agent topology, integration list, signal library, or scope changed
   - `~/Documents/Claude/Projects/Beetle/ATELIER-HANDOFF.md` — if integration status, agents, or handoff details changed
   - `~/Documents/Claude/Projects/Beetle/atelier-phase-1-build-spec.md` — if scope changed (use strikethrough + dated note rather than rewriting history)

   The user has caught me twice on doc-vs-reality drift. This rule blocks "done" the same way tsc and tests do. Drift is a real bug, not a minor footnote.

## Continuous improvement posture

After Phase 1 closes (current trajectory: ~95% done), and again after each subsequent phase, run a **full-app audit** before starting the next phase. Not a triage hardening pass — an actual end-to-end review:

- Every page: UI consistency, empty states, loading, error states, mobile layout, keyboard nav, accessibility
- Every form: validation, error messaging, labels, autocomplete, save-and-refresh, keyboard shortcuts
- Every workflow: brief → quote → send → confirm → shoot → invoice → pay; each transition; every reachable screen
- Every server action: input validation, audit logging, revalidation, error paths, race conditions
- Every integration: Gmail, Drive, Calendar, Anthropic, Supabase, Xero — failure modes, retries, idempotency, kill-switch coverage
- Every table: orphaned columns, missing indexes, RLS coverage matching application logic
- Every cron / background job: what runs when, what happens if it fails
- Every doctrine line in master CLAUDE.md: verify code actually enforces the rule

Output: ranked findings with file:line, prioritised into a polish PR sequence. Don't skip this in the rush to ship the next feature.

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
3. **Phase 3 — corpus + signal surfacing.** ✅ Shipped. The "Tier 2 #13/#15" line in earlier notes referenced PR #13 (agency margin clarity, per-line ASF toggle, print bg, save refresh) and PR #15 (hard delete + anonymised corpus archival) — both already in main. Plus PR #18 (precedent signals panel on booking detail).
4. **Phase 4 — agent automation.** ✅ First pass shipped (PR #19 — agent primitives, critique pass on brief-clarify, auto call sheet). Full agent prompt suite (confidence contracts wired into every agent, precedent requirement enforcement) still pending.
5. **Phase 2 — Xero.** ⏳ Blocked on credentials.
6. **Phase 5 — RLS + partner accounts.** ✅ Shipped end-to-end. PR #20 brought the infrastructure (app_users, role helpers, partner UI). Migrations 0018 + 0019 then dropped the legacy `auth_full_access` AND the pre-existing wide-open `*_anon_all` policies (which would have bypassed every other policy — caught during this session), replacing with `is_owner_or_partner()` for admin tables and self-scoped read policies for talent / crew. Owner + partner accounts seeded; Mason and Patrick provisioned as live crew test accounts. Health probes switched to service-role client so monitor uptime checks still work post-lockdown.
7. **Phase 6 — talent / crew portals.** ✅ Shipped (PR ##  — `/portal/talent`, `/portal/crew`, role-based redirect from dashboard).
8. **Phase 7 — production polish.** ⏳ Performance, monitoring, edge cases — ongoing.
9. **Compliance dashboard (PR#27).** ✅ `/settings/compliance` aggregates passport / licence / WWCC / visa expiry + missing ABN/super/emergency contact across all active talent and crew. Red ≤30d, amber ≤90d, green OK, muted = not provided. Linked from Sidebar → System.
10. **Stylist + HMU templates + compliance auto-ping cron (PR#28).** ✅ Quote builder now has 4 templates (photographer / videographer / stylist / hmu) with discipline-aware auto-suggest. New cron at `/api/cron/compliance-pings` queues an approval-gated draft email for any active talent whose passport / licence / WWCC / visa expires in ≤30 days, idempotent on (talent, doc, expiry) so renewals re-trigger.
11. **Crew/Talent metadata + delete + edit-detail parity (PR#29).** ✅ Migration 0020 adds `city`, `dietary`, `drink_order` to crew + talent (talent already had `home_address`/`dob`, crew now has those plus the three new). Names auto title-case on import + manual save. CSV importer detects duplicates by name/email/mobile (against existing rows AND intra-CSV) and skips them with a clear flag. Dietary: / Drink: text in the notes column is parsed into the structured columns. Crew list groups by city with a city dropdown filter. Crew + Talent detail pages have a `Delete` button (refuses if booking references exist; archives the audit row). Crew + Talent edit forms now expose every field surfaced on the detail page (city, dietary, drink, super, kit_list, certifications, secondary_roles, xero, dob, home_address, emergency contact, work rights, all four expiry fields). Call sheet print format updated to Jasper's house template: stacked Role / Full Name / Phone / Dietary / Drink for each artist + crew.
12. **Audit triage PR#30 — P1 + P2 fixes from external audit.** ✅ Closed the silent approval no-op (chase + compliance emails were queued but never sent on approve — now wire `client_chase_email` and `compliance_renewal_ping` handlers in `approval-effects.ts`, both run a kill-switch re-check and surface send failures). Anthropic model IDs corrected to dated form (`claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`, `claude-opus-4-1-20250805`) — the previous undated aliases silently 404'd against the API. Title-case extended to clients + brands. Bulk imports now write a `bulk_import_*` audit row. Fee-line add/update/remove audit-logged. `sendQuoteEmailAction` wraps `sendEmail` in try/catch so a Gmail failure doesn't transition state to `quote_sent` with no email out. Hold-requests TOCTOU race fixed by passing `idempotency_key` directly into `createApproval` (returns `{approval, duplicate}` on 23505 unique violation). Cron failures now logAudit'd as `cron_*_failed` rows. Both crons now check kill switch before queueing. Post-shoot-chase resolves client email at queue time so the approval handler has it available. Confirmed `/q/[token]` already uses service client throughout. **Column-level RLS for portals shipped — see #13 below.**

13. **Column-level RLS for portals (PR#31).** ✅ Migration 0021 drops the `talent_attached_bookings` + `crew_attached_bookings` policies on `atelier_bookings` (which granted full-row SELECT to anyone in `booking_talent`/`booking_crew`) and replaces them with `atelier_bookings_portal` — a column-restricted view with built-in `is_owner_or_partner() OR booking_talent OR booking_crew` filtering. Talent + crew can no longer hit `/rest/v1/atelier_bookings?select=*` and read `client_id`, `grand_total`, `agency_notes`, `brief_raw_text`, financial totals, usage fields, or any of the 20+ sensitive columns. The view exposes only 15 safe fields (id, booking_ref, title, tier, state, shoot_dates, shoot_date_notes, shoot_location, deliverables_*, looks_per_talent, wardrobe_responsibility, post_production_ownership, retouch_note_format, video_references). `src/lib/data/portal.ts` refactored from a single PostgREST embedded join into two queries (assignments + view) merged in JS, since PostgREST embedding requires a foreign key and the view doesn't have one. Owner/partner unaffected — they read the base table directly via `owner_partner_full`.

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
- ~~Tier-2 features #13 / #15~~ — resolved 2026-05-06: those numbers referred to PR #13 (already shipped previous session: agency margin clarity, per-line ASF toggle, print bg, save refresh) and PR #15 (shipped this session: hard delete + corpus archival). Not pending features.
- **Phase 2 (Xero)** — blocked on credentials. Three env vars needed:
  `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`
  (must match `https://atelier.saundersandco.com.au/api/auth/callback/xero`).
  After OAuth flow runs once, `XERO_REFRESH_TOKEN` and `XERO_TENANT_ID`
  are persisted automatically.
- **Phase 7 (production polish)** — performance, monitoring, edge cases. Standing checklist: tsc clean, tests green, no TODO/FIXME left behind, no hardcoded names/data, AJE eComm #3579 canonical test still passes.

## Forward roadmap (clean — descoped items removed)

What's actually still ahead, in priority order:

1. **Pay-on-paid tracking** — flip a flag when client invoice marked paid in Xero, kick off artist + crew remittance workflow. Depends on Phase 2 (Xero invoice push). Blocked.
2. ~~**Quote template expansion**~~ — stylist + HMU shipped PR#28; further expansion (manicurist-specific, prop stylist, set design) only if Jasper books those disciplines often enough.
3. **Comms agent expansion** — beyond the existing post-shoot chase cron: chase cadences for unanswered quotes, tone variants, brief-clarify follow-ups.
4. **Insurance / BAS reminders dashboard** — pairs with the compliance dashboard but tracks agency-level renewals (public liability, indemnity, BAS lodgement dates).
5. ~~**Talent / crew expiry-renewal automated pings**~~ (passport, licence, WWCC, visa) — shipped PR#28 as `/api/cron/compliance-pings` (daily 22:00 UTC). Drafts approval-gated emails to talent with documents expiring ≤30d.
6. **Data export / right-to-be-forgotten** (Australian Privacy Principles 12 / 13 compliance).
7. **Microsoft Graph webhooks** (replace polling — currently no MS Graph code in the build).
8. **Full agent prompt suite** — confidence contracts wired into every agent (currently only brief-clarify); precedent requirement enforcement (cite 1-3 prior bookings).
9. ~~**Column-level RLS**~~ — shipped PR#31 via `atelier_bookings_portal` view + dropped row policies.

**Roadmap items already shipped (removed 2026-05-06):**
- ~~Repeat-client autofill~~ → `getClientDefaultsAction()` + `BookingFormFields` autofill is already live (majority threshold over last 3 bookings).
- ~~Brief → Quote → Send single screen~~ → `/inbox/[bookingId]` page is already shipped (3-step progress strip, BriefParser + QuoteBuilder + SendQuotePanel in one view).
- ~~Compliance dashboard (was inside #6)~~ → `/settings/compliance` shipped PR#27.

**Explicitly NOT on the roadmap:**

- Marketing agent / Planoly emulation / Klaviyo (descoped — Grid Planner is built, that's all)
- Client portal (doctrine — clients never get logins; they get tokenised URLs only)
- Squarespace integration (still skipped)
- Microsoft Teams integration (out of scope)

## When in doubt

If the master CLAUDE.md and this file disagree, the master wins. If the
master is silent, ask Jasper — don't guess.
