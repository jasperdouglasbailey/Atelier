# CHANGELOG — Atelier worktree

The PR-by-PR ship log. New entries go at the **top**. Each entry is one line for index value + a short paragraph for context. Doctrine and forward planning live in `CLAUDE.md` and `ROADMAP.md` respectively.

## Recent (2026-05-16)

**Cron unification — 4 reminder routes → 1.** `quote-chase`, `post-shoot-chase`, `talent-gallery-ping`, `compliance-pings` (which also handled business renewals) all had the same auth → kill-switch → log _run → match → insert approval → log _complete shape. Now a single `/api/cron/scheduled-comms` route iterates `REMINDER_RULES` from `src/lib/automation/reminder-rules.ts`. Six rules: quote-chase, post-shoot, talent gallery, crew gallery, talent compliance docs, agency business renewals. Per-rule failure isolation (one bad match doesn't black out the rest). Same idempotency keys → cut-over is no-op for already-queued drafts. Net: -797 LOC across the 4 old routes; 4 cron secrets → 1; 4 schedules → 1. Adding a new reminder is now an array entry in `reminder-rules.ts`, not a new route.

**PR#157 — Regenerate generated types + bidirectional exhaustiveness check.** Regenerated `database.generated.ts` from prod schema (was 19+ migrations stale). Upgraded `database.compat.test.ts` to use `Exclude<keyof TGenerated, keyof THand>` — every column in the generated row must exist on the hand type or tsc fails with `{ missing_in_hand: "column_name" }`. 23 tables checked, 3 real drifts found and fixed (Booking missing `is_archived`/`archived_at`, Talent missing `onboarding_token_expires_at`, BookingTalent missing `created_at`).

**PR#156 — Split CLAUDE.md into doctrine + CHANGELOG + ROADMAP.** CLAUDE.md was 386 lines covering doctrine + build status + phase order + forward roadmap + standing checks. ~70% was changelog material masquerading as doctrine. Split: CLAUDE.md is now 204 lines (doctrine only, readable in 5 min); CHANGELOG.md holds the PR-by-PR ship log; ROADMAP.md holds forward planning. Memory-sync doctrine updated to point at the three files.

**PR#155 — Model 404 fallback safety net.** Single-hop fallback chain: on a 404 from a current-gen model ID, retry once with the prior-generation counterpart from the `AnthropicModel` type union. `console.warn` on every fallback so model rot surfaces in logs. Direct response to the PR-E risk: I bumped IDs without live API verification.

**PR#154 — Data-driven talent nicknames.** Migration 0057 adds `nicknames text[]` to `atelier_talent`, seeded with `Oly → Oliver Begg`. TalentEditForm exposes comma-separated input. `/inbox` brief-detection query selects `nicknames` alongside `working_name` — heuristics scale with the roster, no more code edits.

**PR#153 — Anthropic prompt caching + model bump + latent insert fix.** `anthropic.ts` builds `system` as blocks with `cache_control: { type: 'ephemeral' }` (two breakpoints: trifecta clause + per-purpose prompt). Default haiku-tier bumped to `claude-haiku-4-5-20251001`; AnthropicModel union keeps prior-gen IDs as fallbacks. Migration 0056 fixes a latent insert mismatch where `anthropic.ts` had referenced columns (`purpose`, `cost_usd`, `success`, `response_preview`) that didn't exist. New `computeLlmCallCost()` helper makes the cost math testable (7 new tests). Voice rules refactored to derive sign-off from `agency-config.ts` (pre-commit hook caught the hardcoded literal).

**PR#152 (PR-D) — P2 polish sweep (9 findings).** Auth/audit gaps on campaigns/usage-licences/tasks. Silent `.limit(200/500)` caps converted to observed ceilings (`.range(...)` + `console.warn`). Cron doctrine: `tomorrow-digest` emits `_complete` event. Model-version hygiene in seed-costs. Accessibility: kill-switch toggle `aria-label`. TOCTOU on portal hold responses (`.eq('status', row.status)`).

**PR#151 (PR-C) — P1: cron + portal hardening.** Kill-switch gate on `auto-anonymise` + `tomorrow-digest` crons (auto-anonymise is irreversible — RED must defer). `/api/instagram/profile` is owner/partner only. `proposeHoldRequestsAction` requires owner/partner + audit-logged. Portal preview mode disables action buttons with "Preview — read-only" hint.

**PR#150 (PR-B) — P1: overtime/super split + revalidation + handlers.** `computeCrewPayment` extended with optional `overtimeSubtotal` param — overtime is GST-bearing but NOT super-bearing. Quote totals were always correct (line-level `is_super_bearing` worked); JobPnLPanel + accounting + crew bill print were overstating super by 12% of OT. AJE eComm #3579 canonical test still byte-identical. `quotes-public.ts` accept/decline calls `revalidatePath('/bookings/<id>')` + `revalidateTag('bookings', {})`. `approval-effects.ts` explicit no-op cases for `hold_response_notify` + `onboarding_review` (silenced "no handler" warn).

**PR#149 (PR-A) — P0 auth lockdown.** `provisionAppUserAction` / `toggleAppUserActiveAction` / `deleteAppUserAction` in `app-users.ts` + `toggleKillSwitchAction` in `kill-switch.ts` had no auth guard and used the service client. Any authenticated portal user could elevate themselves to owner or freeze the platform. `requireOwnerOrPartner()` added to all four. Kill-switch attempts also write `kill_switch.*.toggle_failed` audit rows for security visibility.

**PR#148 — Dev guards (pre-commit + pre-push hooks).** Zero-dep wiring via `.githooks/` + `prepare` script. Pre-commit blocks hardcoded `"Saunders & Co"` / `"Jasper Bailey"` / agency emails (allowlist: agency-config, tests, comments, env-fallbacks, `// HARDCODED-OK`). Pre-push runs `tsc --noEmit` + `vitest run`. `npm run preflight` runs both on demand. Caught real violations within the same session.

**PR#147 — Grid Planner 4:5 aspect + real `@saundersandcoagency` data.** Aspect ratio fixed (was 9:16 — IG's actual feed grid is 4:5). `/api/instagram/profile` uses `facebookexternalhit/1.1` UA (regular browser UAs stopped returning OG tags after IG's late-2024 client-render migration). Real avatar + display name + handle in the phone mockup. "Stats as of HH:MM" + Refresh button.

**PR#146 — Grid Planner redesign with image persistence.** IndexedDB storage for image blobs (`idb-storage.ts`). Scheduled-date + content-type indicators on slots. Bulk multi-file upload with overflow-to-empty-slots. 160px image-preview + flex form layout.

**PR#145 — Cost vs billed split on fee lines.** Migration 0055 adds nullable `cost_subtotal` column. `effectiveCost(line) = cost_subtotal ?? subtotal`. ASF + GST + super-charged on billed; commission + super-paid on cost. New "Spread captured" agency-margin row in JobPnLPanel when cost < billed. AJE eComm #3579 canonical test passes byte-identical (no `cost_subtotal` set).

---

## 2026-05 dashboard / undo / list redesign wave (PRs #115-#126)

**PR#125-126 — Upcoming-shoots filter + hover card stays on screen.** `getUpcomingShoots()` was returning past bookings (no date filter). Calendar hover card clipped at month edges. Refactored to React portal + `position: fixed` from `getBoundingClientRect()` with measure-and-flip. Touch devices skip popover via `matchMedia('(hover: hover)')`. PR#126 expanded state filter to all pre-shoot states.

**PR#124 — Drag-reorder of fee lines persists reliably.** `.upsert({id, sort_order}, {onConflict: 'id'})` silently failed because PostgREST validates INSERT side of ON CONFLICT against NOT NULL columns. Fix: individual `.update()` per-row in parallel via Promise.all. Bonus `fee_line_reorder` audit row.

**PR#123 — Dashboard equal heights + inbox briefs preview.** Side-by-side panels match height via `h-full` detection in SectionCard. InboxPreview shows potential brief candidates from Gmail alongside pending approvals.

**PR#122 — Dashboard layout v2.** 3-col / 4-row grid matching Jasper's sketch. Calendar + Upcoming + Crew-on-hold + Jobs-needing-crew + Pipeline + Inbox + Kill switch + Finance.

**PR#121 — Dashboard redesign v1.** Six new components: GreetingHeader, MiniMonthCalendar, FinanceSection, ThisWeekStrip, InboxPreview, SettingsSnapshot. `lib/data/dashboard.ts` data layer.

**PR#120 — Hotfix: dismissed_by uuid → text.** Migration 0051 declared the column as `uuid REFERENCES auth.users(id)` but the app uses `getCurrentActor()` which returns email. Migration 0052 drops FK + alters to text.

**PR#119 — Undo trio.** Reject-approval + delete-fee-line + delete-schedule-row all get the toast-undo pattern from PR#118. New shared `<UndoToast>` component.

**PR#118 — Dismiss-brief persistence + convert-to-booking undo.** PotentialBriefs panel was dismissing in React local state only. Migration 0051 creates `atelier_dismissed_brief_candidates` + adds `source_gmail_message_id` to bookings. Two undo layers: 8s toast + persistent "Show N dismissed" toggle. Established **reversibility doctrine** — actions undoable UNTIL external side effect.

**PR#117 (Redesign PR-3) — Settings + Inbox dense layouts.** Settings KpiStrip + 3-col Admin/Toggles/Push + 2-col Profile/Defaults + full-width Integrations + 4-col Scheduled Jobs. Inbox KpiStrip + inline tab pills.

**PR#116 (Redesign PR-2) — Shared KpiCard + SectionCard across 5 overview pages.** Dashboard / Reports / Compliance / Renewals / Costs now share one visual idiom.

**PR#115 (Redesign PR-1) — Shared DenseListTable across 5 list pages.** Talent / Crew / Clients / Locations / Audit — 3-col card grids → sortable dense rows (~5× density), inline filter bar, optional grouping with localStorage-persisted collapse.

**PR#114 — Kill switch UX + Realtime banner + audit deep-link.** React 19 `useOptimistic` on the toggle (was ~10s lag). Migration 0050 adds `atelier_kill_switch` to `supabase_realtime` publication. Banner "X email operations failed" now links per-action to `/audit?action=<name>`.

---

## Workflow + privacy wave (PRs #65-#99)

**PR#99 — Fix all P1s and P2s from AUDIT-2026-05-14B (17 P1s + 13 P2s).** Five thematic groups: (A) quick wins (QuoteActions refresh, attention sort, StageChecklist optional items grey, BookingTeam empty state). (B) notification gaps (onboarding_review + hold_response_notify). (C) data correctness (auto-upsert schedule rows on shoot_dates change, hold-requests awaited, HoldExpiryBadge 60s refresh). (D) UX polish + infrastructure (GridPlanner localStorage, /q/[token] expiry, QuoteBuilder ASF tooltip, Settings Gmail failure banner + cron health table, all crons emit `_run`/`_complete`). (E) email + batch (buildRemittanceEmail, markTalent/CrewPaid remittance, approveAllHoldsAction).

**PR#91 — Surface real DB error on fee-line save + auth guard.** Generic "Failed to update" was masking RLS denial, enum mismatch, constraint failure. `updateFeeLine` returns `{ ok, data | error: message · code · details · hint }`.

**PR#90 — Block reimbursement on commissionable lines + split overtime artist/crew.** Migration 0046 adds `artist_overtime` enum. `artist_overtime` commissionable; `overtime` stays crew OT.

**PR#89 — QuoteBuilder edits not propagating.** `commitEdit` was missing `router.refresh()` after successful save. Fee-line table updated optimistically but JobPnLPanel kept stale prop data.

**PR#88 — QuoteBuilder edit-row redesign + UI polish.** Edit row redesigned from 10-column squeeze to single-cell colSpan. Sticky totals panel. PrintDocsMenu dropdown collapses 6 buttons.

**PR#87 — Print template fixes + artist portal fees + PDF performance.** Quote PDF totals reorder (GST before Crew Fringes). Category grouping on Quote + Confirmation PDFs. Shared `pdf-renderer.ts` utility (blocks images/fonts, uses `'load'` not `'networkidle0'`).

**AUDIT-2026-05-14 + 6 fix PRs (A-F).** First comprehensive audit; 0 P0, 11 P1, 13 P2 findings. `requireOwnerOrPartner()` on all 14 entity mutations + 3 location mutations. Schedule delete confirm. HoldExpiryBadge timezone fix via Intl. Public quote audit-log. BookingTabs `?tab=` URL sync. Hardcoded hex sweep. JobPnLPanel empty state.

**PR#74 (Syngency-inspired) — 6 features.** 5-tab booking detail restructure (BookingTabs). Quote accept/decline on /q/[token]. Talent bookouts (migration 0040). Tasks system (migration 0041, polymorphic booking/talent/crew). Booking Confirmation print template. Per-day schedules (migration 0042).

**PR#66 — Security + UX hardening.** Auth guards on markTalent/CrewPaid + sendQuickEmail. Booking state check on payroll. Server-side email format validation. Same-artist guard in substituteTalentAction. Migration 0038 adds `confirmed_at`.

**PR#65 — Workflow UX: JobPnLPanel + morning-after urgency + QuickCompose + talent substitution.** JobPnLPanel per booking. Red "OT window closes in Xh" badge on dashboard. QuickCompose panel. Inline talent substitute with audit trail.

**PR#64 — Portal interactivity.** Migration 0037. Talent/crew respond to hold requests. Talent confirms day rate + acknowledges brief. Crew self-reports unavailability. Digital call sheets in both portals.

---

## Foundational waves (PRs #14-#63)

These shipped phase 1 through phase 6 + the first round of polish. Listed chronologically with anchor PRs only — anything in this range was either superseded by later work or has its detail captured in the source files.

**Phase 1a — parity + small wins.** Booking pipeline, quote builder, fee engine, brief parser, hold requests, morning-after checklist, dashboard, reports, talent/crew/client lists + detail + edit, print templates, Send Quote, public quote viewer, audit log, kill switch, Google OAuth.

**Phase 1b — entity expansion + resilience.** PRs #14 (resilience pass — reportDataError, generated types, /api/health, logAuditFailure), #15 (hard delete + corpus archival), #17 (magic-link onboarding), auto Drive folders.

**Phase 3 — corpus + signal surfacing.** PR #13 (agency margin clarity, per-line ASF toggle, save-refresh). PR #15 (hard delete + anonymised corpus). PR #18 (precedent signals panel — talent rate band, client total band, talent-client prior work, corpus signal).

**Phase 4 — agent automation.** PR #19 (agent-primitives.ts: JASPER_VOICE_RULES, critiqueDraft, buildConfidenceContract, formatPrecedentCitation). PR #32 (confidence contracts + precedent citations wired into brief-intake + hold-requests).

**Phase 5 — RLS + partner accounts.** PR #20 (atelier_app_users, is_owner_or_partner, /settings/partners). Migrations 0018 + 0019 (dropped auth_full_access + wide-open *_anon_all policies). PR #31 (column-level RLS via atelier_bookings_portal view).

**Phase 6 — talent / crew portals.** /portal/talent + /portal/crew with own profile, bookings, day rate, compliance hints. Dashboard layout redirects talent/crew users to portal.

**PR#27 — Compliance dashboard.** `/settings/compliance` aggregates passport/licence/WWCC/visa expiry + missing ABN/super/emergency contact. Red ≤30d, amber ≤90d, green OK.

**PR#28 — Stylist + HMU templates + compliance auto-ping cron.** Quote builder gains 4 discipline-aware templates. `/api/cron/compliance-pings` queues approval-gated emails for documents expiring ≤30d.

**PR#29 — Crew/Talent metadata + delete + edit-detail parity.** Migration 0020 adds city, dietary, drink_order. Title-case on import + manual save. CSV duplicate detection. Call sheet print format updated to house template.

**PR#30 — First external audit triage.** Closed silent approval no-op (chase + compliance emails were queued but never sent on approve). Anthropic model IDs corrected to dated form. Title-case extended. Bulk imports audit-logged. Fee-line mutations audit-logged. Hold-requests TOCTOU race fixed.

**PR#33 — Quote-chase cron.** Mirror of post-shoot-chase. Migration 0022 adds `quote_sent_at`. Drafts in Jasper's voice — day-3/7/14/21 marks.

**PR#34 — Brief-clarify auto-trigger.** When `parseBriefAction` lands `contract.confidence < 70`, `autoQueueBriefClarifyIfNeeded` queues a template-driven clarifying email automatically.

**PR#35 — Business renewals dashboard + Privacy data export/RtbF.** `/settings/business-renewals`. APP 12/13 — `/api/export/talent/[id]` + `anonymiseTalent/Client/CrewAction` + `<DataRightsControls>`.

**PR#36 — Tone variants per client.** Migration 0024 adds `communication_style` (formal/casual/terse/null). `comms-tone.ts` utility branches all automated emails.

**PR#37 — Talent gallery-share reminder cron.** `/api/cron/talent-gallery-ping` 1 day after final_delivery_at.

**PR#41 — Security & privacy hardening.** Quote-token expiry (180d). Security headers (HSTS / X-Frame-Options / Permissions-Policy). Drive folder soft-delete on anonymise. Per-cron secrets via `cron-auth.ts`. Daily data-retention cron (expired enum, retention sweeps).

**PR#42 — List filter + four security gaps.** `is_active` filter on listTalent/listCrew. toggleKillSwitch logs actor. sendQuote checks kill switch. /api/onboard rate-limited. Google OAuth state-cookie CSRF guard.

**PR#43 — Booking detail UX pass.** Tools moved to header. StageChecklist optional → amber. Brief + Usage merged. BookingTeam fee display removed (lives in quote). QuoteBuilder grand total collapsed by default.

**PR#44 — Bookings list view.** Calendar is default for new visitors (cookie persists). View order Calendar → Board → List. New title format. Solid colours with YIQ contrast. BookingHoverCard pin popover with copy buttons.

**PR#45 — Booking lifecycle: archive / delete UI / typed-confirm anonymise / 7-year auto-anonymise.** Migration 0027 adds `is_archived` + `archived_at`. Type "DELETE" / "ANONYMISE" caps confirms. New `/api/cron/auto-anonymise` (APP 11.2 retention).

**PR#46 — Calendar sync improvements.** `updateCalendarEvent` for shoot_dates edits. Attendees on create (talent + crew emails). `deleteCalendarEvent` with `sendUpdates=all`.

**PR#47 — Crew + talent city ordering.** `city-order.ts` (anchors first, frequency desc, alphabetical). `CollapsibleCityGroup`. Crew conflict detection across booking dates.

**PR#48-50 — Privacy compliance.** Public `/privacy` page (APP 1.4(a)–(g), 2, 7, 8, 11, 12, 13). CollectionNotice on /onboard. PortalDataRights panel. Three operational docs (incident response, privacy contact, email signature).

**PR#52 — Performance: DB indexes + SQL aggregations + unstable_cache.** Migration 0028 adds 6 btree indexes. Two RPC functions for dashboard KPIs. `dashboard-cache.ts` (60s TTL, tag-busted).

**PR#53 — Crew detail UX.** Two-column grid. Multi-role display "Digital Operator / Assistant". `secondary_roles` checkboxes.

**PR#54 — Per-artist preferred crew.** Migration 0029 `atelier_talent_preferred_crew`. PreferredCrewPanel. BookingTeam picker groups crew into optgroups.

**PR#55 — Use-as-template + pre-flight quote gate + Drive deep-links.** CloneBookingButton. SendQuotePanel two-step pre-flight modal. Drive ↗ buttons.

**PR#51 — Workflow tools bundle.** Revenue-this-week KPI. EmailTonePreview on ClientEditForm. `/api/cron/tomorrow-digest` (06:00 AEST Jasper digest). `/api/print/quote/[id]` PDF endpoint. PotentialBriefs panel on /inbox.

---

## What's fully built today

- Booking pipeline: all 13 states, list + kanban board + month calendar, detail, edit, new
- Quote builder: versioned, 4 discipline templates, artist/outgoing split, live total preview, inline edit, drag reorder, cost-vs-billed split
- Quote agency-margin breakdown: commission + ASF + super spread + spread-captured
- Usage licences: media × territory × duration, BUR calculator
- Fee engine: 20% commission, 15% ASF, 12/15% super, 10% GST, overtime non-super-bearing — AJE eComm #3579 canonical test passes
- Brief parser (LLM): 15 canonical fields, confidence contract
- Hold requests: auto-propose preferred-core crew, kill-switch gated, precedent citations
- Morning-after checklist + OT/expense entry + 7-day lock cron
- Dashboard: greeting, calendar, attention queue, finance section, inbox preview, settings snapshot, kill switch
- Reports: 12-month revenue, state/tier breakdown, top clients, top artists, win rate
- Talent: list, detail (3-row header, stats, booking history, default rate, nicknames), edit, archive, anonymise
- Crew: list (city grouping), detail (multi-role), edit, archive, anonymise
- Clients: list, detail (revenue KPIs, frequent artists, history, comm tone), edit, anonymise
- Locations: list, detail (geo coords, tags, rooms), edit
- Print templates: quote, invoice, artist brief, crew brief, call sheet, confirmation, accounting, crew bill — all with PDF endpoints
- Send Quote: pre-flight modal, Gmail send/draft, clipboard fallback
- Public quote viewer `/q/[token]`: token expiry, self-serve accept/decline, audit-logged
- Booking team: talent/crew with nicknames, preferred crew, hold expiry badges, unavailability badges, substitute, payroll
- Tasks system (booking/talent/crew polymorphic)
- Schedules (per-day call/wrap/location/notes)
- Inbox: ApprovalQueue + PotentialBriefs from Gmail + dismissed-recovery + tab URL sync
- Settings: kill switch (3 levels, realtime banner), partners (provision/toggle/delete), agency profile, fee defaults, integrations, scheduled jobs, compliance, business renewals, costs
- Audit log: failure rows red, deep-linkable from settings banners
- Drive folders: auto-created for clients/artists/crew/bookings; soft-delete on anonymise
- Calendar events: created on quote_confirmed with attendees; updated on shoot_dates change; cancelled on delete
- Grid Planner: 4:5 aspect, IndexedDB image storage, scheduled dates + content types, live IG stats
- Talent + crew portals: hold response, rate accept, brief ack, unavailability, digital call sheet, data rights
- Onboarding: magic-link `/onboard/[token]` flow + open `/onboard` self-service
- Crons (8 active): quote-chase, post-shoot-chase, talent-gallery-ping, compliance-pings, business-renewals, tomorrow-digest, auto-anonymise, data-retention, brief-clarify (auto-triggered)
- LLM: Anthropic prompt caching, cost tracking, kill-switch gated, idempotency, model 404 fallback
- Git hooks: pre-commit identity guard + pre-push tsc/tests
- Tests: 185+ pure-function tests, AJE eComm #3579 canonical preserved

## What's not built / blocked

- **Phase 2 (Xero invoice sync)** — blocked on `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` env vars
- **`ANTHROPIC_API_KEY`** — code is wired but LLM features degrade to no-op without the key
- **`CRON_SECRET`** — needed in Vercel Production env scope for crons to fire
- Microsoft Graph webhooks (no MS Graph code in the build)
