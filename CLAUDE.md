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

## Fee model rules (canonical, locked in 2026-05-14)

Per Jasper's spec — applies to defaults in `lineTypeDefaults()` in `src/app/actions/quotes.ts` and `defaultChargeGst()` / `ASF_OFF_BY_DEFAULT` / `ALWAYS_GST_LINE_TYPES` in `src/components/quotes/QuoteBuilder.tsx`.

| Line type | Commission 20% | ASF 15% default | GST default | Super (15% charged / 12% paid) |
|---|---|---|---|---|
| `artist_fee`, `usage_licence`, `file_management`, `retouching`, `post_production`, `artist_overtime`, **`artist_travel`** | ✅ Yes | ✅ On | Follows artist's `gst_registered` | ❌ No |
| `crew_labour` (day rate) | ❌ No | ✅ On | Follows crew's `gst_registered`, ON if no crew picked | ✅ **Yes — only on day rate** |
| `overtime` (crew overtime) | ❌ No | ✅ On | Follows crew's `gst_registered`, ON if no crew picked | ❌ **No — overtime is NOT super-bearing** |
| `equipment_rental`, `crew_equipment`, `studio_hire` | ❌ No | ✅ On | ✅ **Always ON regardless of payee** — supplier invoice has GST | ❌ No |
| `travel` (crew/production travel), `catering`, `wardrobe`, `props`, `casting`, `location_fee`, `permits`, `insurance`, `other_expense` | ❌ No | ✅ On | Follows crew GST status if crew_id linked; ON by default | ❌ No |

**Travel split:** `artist_travel` (commissionable, artist's paid travel time) is distinct from `travel` (crew + production travel, not commissionable). Same pattern as `artist_overtime` vs `overtime`.

**Other invariants:**
- ASF is toggleable per line — user can flip it off for genuine pass-through cost
- GST toggle is "Charge GST" (positive sense). Checked = applied
- Commissionable lines can NEVER be reimbursements (enforced server-side in `addFeeLineAction`/`updateFeeLineAction`)
- Super spread (15% − 12% = 3%) is agency margin, computed in `computeAgencyMargin`
- Net GST to ATO = collected from client − input credits paid to GST-registered talent/crew

## Development discipline rules (added 2026-05-13 — violations caused CI failures)

These are not aspirational. They are required. Every one has caused a real bug or CI failure.

**Select-type parity — the most common failure mode.**
Whenever you add a field to a Supabase `.select()` string, update the corresponding TypeScript return type in the same commit. The two must change together. The `BookingDetailRow.client` type and `getBooking()` select string diverging broke CI in PR #67.

**Schema change ripple — all four layers, always.**
Every DB schema change must propagate through all of: migration SQL → `database.generated.ts` → `database.ts` (hand types) → any `.select()` return types that name specific columns. Missing any layer causes silent runtime errors or type failures that CI will catch.

**Agency config — never hardcode.**
Agency name, email, ABN, address always come from `getAgencyConfig()`. Never write "Saunders & Co" or any email address directly in JSX, copy, or emails.

**Auto-commit and merge — always, without prompting.**
After implementing any task: verify types, commit with a clear message, open a PR, and merge it immediately. Do not ask the user to merge. Only pause for genuine task ambiguity, not process steps.

**CI must be green before calling done.**
Before declaring a task complete, check `mcp__github__pull_request_read(get_check_runs)` on the PR. If the `check` job failed, diagnose and fix before moving on. Never merge a failing PR without acknowledgment from the user.

**Ripple-effect audit on every change.**
After implementing, grep for every callsite that accesses any new field, type, or function. Verify each is typed correctly, that no existing code breaks because of type shape changes, and that no server action is missing the new field in its allowlist. This is not optional — the CI failure in PR #67 was exactly this class of error.

**Migration idempotency.**
All migrations use `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. A migration that fails on second run will break any automated deploy pipeline.

**`revalidateTag` completeness.**
Every server action that mutates booking data must call `revalidateTag('bookings')`. Check this whenever adding a new mutation path.

## Standing checks before declaring "done"

1. `rm -rf .next && npx tsc --noEmit` (clean, zero errors)
2. `npm test` (79+ tests must stay green; add tests when changing pure functions)
3. `grep -rn "TODO\|FIXME\|XXX" src/` for anything new I left behind
4. Search for hardcoded user names / fake data — should be `getCurrentActor()` or env
5. If touching the fee engine, the AJE eComm #3579 canonical example must still pass
6. Check PR check runs — `check` job must be green before calling done
7. **Memory sync — non-negotiable.** Every PR that ships, before declaring done, re-read all of these files and update anything that's now wrong:
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

### Standard audit execution procedure (added 2026-05-14)

The audit prompt that produced `docs/AUDIT-2026-05-14.md`. Reproduce verbatim for future audit sessions:

```
You are doing a comprehensive platform audit of the Atelier codebase, covering PRs [X–Y].

Run these checks in order. For each check, report findings as: SEVERITY | FILE:LINE | DESCRIPTION | FIX.
Severity levels: P0 (broken / data loss), P1 (wrong-but-not-broken), P2 (polish).

BASELINE
1. tsc --noEmit — confirm zero type errors
2. npm test — confirm all tests green
3. Count server actions across all actions/ files — note total
4. Spot-check 5 random .select() strings against their TypeScript return types

REVALIDATION + AUDIT GAPS
5. Grep revalidateTag in all server actions — flag any that use the one-arg form (missing {})
6. Grep every server action for logAudit — list any mutation that skips it (auth actions, public token actions)
7. Check portal.ts — does every action call revalidateTag('bookings', {}) after revalidatePath?
8. Check entities.ts + locations.ts — does every mutation gate on owner/partner role?

BOOKING DETAIL WALK (src/components/bookings/BookingDetail.tsx + tabs)
9. Every button/link in the tools row — does it navigate or fire an action? No dead href="#"
10. StageChecklist + BookingAdvanceButtons — does every state transition have a confirm? Enter key?
11. QuoteBuilder — optimistic update + revert on error? Drag handle tooltip/opacity?
12. JobPnLPanel — empty state when no quote? Paid Out row hidden when zero?
13. SchedulesPanel — does Delete have a confirm?
14. BookingTeam — HoldExpiryBadge present on talent + crew rows? Timezone correct?
15. HoldExpiryBadge — color thresholds sensible? >7d green, 4-7d amber, ≤3d red, expired filled red?

PORTAL + INBOX + DASHBOARD WALK
16. /portal/talent + /portal/crew — every interactive element fires the correct action
17. /inbox — ApprovalQueue key={filter} so state resets on tab change?
18. BookingTabs — URL sync on tab change via ?tab= param?
19. /q/[token] — QuoteActions accept/decline: audit logged? State check correct?
20. Dashboard attention queue — OT window urgency badge present?

TALENT / CREW / CLIENT WALK
21. Talent detail — 3-row header: identity / badges / actions? ArchiveTalentButton present?
22. Crew detail — same 3-row structure? ArchiveCrewButton present?
23. Client detail — same 3-row structure? (was single-row in earlier builds)
24. DeleteEntityButton — type-to-confirm or two-step? Consistent with booking delete?
25. DataRightsControls — anonymise has typed confirmation? Export link opens correctly?

VISUAL TOKEN CONSISTENCY
26. Grep for hardcoded hex codes (#[0-9a-fA-F]{6}) in src/components — list any outside PALETTE
27. Grep for inline "text-xs font-semibold uppercase tracking-wide" on h3 elements — should use .section-title
28. Check that all PALETTE.muted / PALETTE.danger / PALETTE.warning / PALETTE.success usages
    are correct (muted for inactive, not for "all good")

OUTPUT FORMAT
- Produce a severity table (P0/P1/P2 counts)
- List every finding with file:line, description, fix
- Group into a suggested fix-PR sequence (smallest PRs first, dependencies second)
- Write the full findings to docs/AUDIT-YYYY-MM-DD.md
```

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
14. **Confidence contracts + precedent citations (PR#32).** ✅ Phase 4 doctrine completion. `BriefIntakeResult` now carries a `contract: ConfidenceContract<ParsedBrief>` populated alongside the legacy flat fields — both heuristic-only and merged-LLM paths compute the contract with top-2 uncertainties and a `bestNextQuestion` when confidence < 85 (e.g. "Can you confirm the shoot date(s)?"). Hold-requests pre-loads each proposed crew member's last 3 confirmed bookings via a single batched query (also fixes the audit's N+1 finding) and populates `precedent_refs` on every approval row, so when Jasper reviews a hold request the inbox shows "we've used Mason on AJE-0042, AJE-0036, AJE-0019" alongside the recommendation. Audit P2 #11 closed; the entire 13-finding audit is now resolved.
15. **Quote-chase cron (PR#33).** ✅ Mirror of post-shoot-chase but for the OTHER end of the booking lifecycle: bookings stuck in `quote_sent` for 3/7/14/21 days with no client reply. Migration 0022 adds `quote_sent_at` to `atelier_bookings` (set automatically when `transitionState` lands a booking in `quote_sent`, backfilled from `updated_at` for current bookings). New cron at `/api/cron/quote-chase` (daily 21:30 UTC) drafts approval-gated emails in Jasper's voice — gentle day-3 check-in, day-7 call offer, day-14 priority check, day-21 final follow-up. New `client_quote_chase_email` action_type with handler in `approval-effects.ts` reusing the shared `sendApprovedEmail` helper. Idempotent on `quote_chase_{bookingId}_{dayMark}`. Closes the biggest daily-workflow gap on the agency side post-audit.
16. **Brief-clarify auto-trigger (PR#34).** ✅ When `parseBriefAction` lands a low-confidence result (`contract.confidence < 70`), `autoQueueBriefClarifyIfNeeded` (in `src/lib/automation/brief-clarify.ts`) queues an approval-gated clarifying email draft into the inbox automatically — Jasper no longer has to remember to chase. Template-driven (no LLM) for speed; the existing manual `draftClarifyingEmailAction` still goes through full LLM + critique when Jasper triggers it explicitly. Picks up to 4 questions from a priority list (date → location → deliverables → talent → usage). Handler `client_brief_clarify_email` in `approval-effects.ts` reuses `sendApprovedEmail`. Kill-switch guard, idempotent on `brief_clarify_auto_{bookingId}` so re-parses don't duplicate. Fire-and-forget call from `parseBriefAction` so the parse response stays fast.
17. **Business renewals dashboard + cron (PR#35).** ✅ `/settings/business-renewals` tracks agency-side renewals (insurance, BAS, ASIC, domain, accountant engagement). Migration 0023 creates `atelier_business_renewals` (type, label, expires_at, notes, reminder_queued_at, is_archived) — owner/partner only via `owner_partner_full` policy. UI mirrors `/settings/compliance` with red ≤30d / amber ≤90d / green OK colour coding, inline add/edit/delete. The `compliance-pings` cron now sweeps this table too — for any renewal expiring in ≤30 days, it queues an approval-gated reminder email to `NEXT_PUBLIC_AGENCY_EMAIL` with action_type `business_renewal_reminder`. New approval handler reuses `sendApprovedEmail`. Idempotent on `business_renewal_{id}_{expiresAt}` so renewing a policy (new expiry date) re-triggers a fresh reminder cycle. Sidebar gains Renewals link under System.
18. **Privacy: data export + right-to-be-forgotten (PR#35).** ✅ Australian Privacy Principles 12 + 13 compliance. New endpoints `/api/export/talent/[id]` and `/api/export/client/[id]` return a JSON download containing every row referencing the entity (profile, all assignments, fee lines, audit log entries; for clients also bookings + quote versions). Owner/partner only via `getCurrentAppUser()` check. New `anonymiseTalentAction` and `anonymiseClientAction` server actions implement APP 13 — replace working_name/legal_name with `Anonymised <random8>`, null out every PII column (email, mobile, dob, home_address, emergency_*, super_*, all four expiry fields, dietary, drink, ABN, instagram, website, xero, drive folder, notes), set `is_active=false` and clear onboarding token. Booking_talent / fee_lines / audit_log references stay intact so financial history isn't lost. New `<DataRightsControls>` component on talent + client detail pages exposes both actions with a two-step confirm. Both export and anonymise audit-log the operation.
19. **Tone variants per client (PR#36).** ✅ `communication_style` (formal | casual | terse | null) added to `atelier_clients`. Migration 0024. New `src/lib/utils/comms-tone.ts` utility with three register variants for all automated outbound emails: `buildQuoteChaseEmail`, `buildPostShootChaseEmail`, `buildBriefClarifyEmail`. null defaults to casual (existing Jasper voice unchanged). Quote-chase cron, post-shoot-chase cron, and brief-clarify auto-trigger all thread `communication_style` through. "Email Tone" dropdown added to client edit form; field shown on client detail page. Also fixed a Turbopack build breakage (pre-existing): `BusinessRenewalsClient.tsx` was importing constants from `business-renewals.ts` (server-only), fixed by splitting pure types/constants into `business-renewals-types.ts`.
20. **Talent gallery-share reminder cron (PR#37).** ✅ New `/api/cron/talent-gallery-ping` (daily 21:45 UTC). 1 day after `final_delivery_at`, queues one approval-gated email per confirmed talent on the booking asking them to share their selects / gallery link. New `talent_gallery_share_request` action_type + handler in `approval-effects.ts`. Idempotent on `talent_gallery_{bookingId}_{talentId}`.
21. **Crew data rights — APP 12/13 parity (PR#38).** ✅ Crew lacked the privacy controls added for talent/client in PR#35. Added `/api/export/crew/[id]` (JSON export: profile + assignments + fee_lines + audit_log), `anonymiseCrewAction` (nulls all PII, sets inactive), extended `DataRightsControls` to accept `type="crew"`, and added the panel to the crew detail page.
22. **PR#41 — security & privacy hardening + portal-wide humanise sweep.** ✅ Quote-token expiry (180d, migration 0025), security headers (HSTS / X-Frame-Options / Permissions-Policy via `next.config.ts`), Drive folder soft-delete on every anonymise action (talent / client / crew), per-cron secrets via `cron-auth.ts` shared helper, daily data-retention cron (migration 0026 `expired` enum, expires pending approvals >30d, hard-deletes >180d, purges `atelier_llm_calls` >90d). Portal-wide humanise sweep — 16 sites that still showed `snake_case` / `camelCase` now read in plain English.
23. **PR#42 — list filter + four security gaps.** ✅ `listTalent()` and `listCrew()` were not filtering on `is_active` so anonymised / archived records ghosted the active lists — `.eq('is_active', true)` added to both. `toggleKillSwitchAction` no longer logs `userId: null` (calls `getCurrentActor()`). `sendQuoteEmailAction` now hits `checkKillSwitch()` before direct sends (drafts remain unblocked). `/api/onboard` rate-limited to 5 req/IP/10min. Google OAuth callback validates a `state` cookie set by the start route — closes the CSRF gap.
24. **PR#43 — booking detail UX pass.** ✅ Tools moved to top of header (Edit / Workspace / Print quote / Client view / Print invoice / Call sheet sit beside title). StageChecklist `optional` items now use the same amber as `pending` (incomplete things never read as "blank"). Brief and Usage merged into one `Brief` panel — usage is a property of the job, not a separate concept. BookingTeam: removed Day / Usage fee display from talent rows (fees live in the quote — duplicate display was the source of the user's "why doesn't this sync" confusion); humanise applied to crew role labels and the add-crew dropdown; new `isLocalCrew()` helper sorts attached + available crew so people based in the shoot city surface first, with a "Sydney · local" badge inline. QuoteBuilder grand total panel collapsed by default — `Show full breakdown` toggle reveals the subtotals + GST passthrough + agency margin internals.
25. **PR#44 — bookings list view.** ✅ Calendar is now the default view for new visitors, choice persists to a `bookings_view_pref` cookie. View order Calendar → Board → List (left → right). New title format on calendar bars + list rows: `BOOK-0042 - Oliver Begg - AJE, Resort 26`; multi-artist collapses past 2 names. Calendar bars now use solid colours with auto-contrasted text via YIQ luminance — fixes the unreadable yellow `shoot_live` state. New `BookingHoverCard` component renders a stay-pinned popover with full team contact details and three copy buttons (Copy artists / Copy crew / Copy all in call-sheet format) — hover-stay logic uses a 120ms close timer so the cursor can cross from row → popover without it closing. New stage-colour legend at the bottom of the calendar. New `getBookingsRoster()` data fetcher batches contact details for visible bookings; new `formatBookingTitle()` utility.
26. **PR#45 — booking lifecycle: archive / delete UI / typed-confirm anonymise / 7-year auto-anonymise.** ✅ Migration 0027 adds `is_archived` (boolean) + `archived_at` (timestamptz) to `atelier_bookings`. `listBookings` filters out archived rows by default; new `archivedOnly` and `includeArchived` filters. New `archiveBookingAction` / `unarchiveBookingAction` server actions, both audit-logged. `BookingLifecycleControls` component on the booking detail page: Archive (warning palette) and Delete (danger palette, requires typing `DELETE` in caps; disabled until terminal state). `DataRightsControls` anonymise now requires typing `ANONYMISE` in caps before destructive action. New `/api/cron/auto-anonymise` (daily 04:15 UTC) implements APP 11.2 retention — anonymises talent / crew / clients that are inactive AND haven't appeared on a booking with shoot or created_at within the last 7 years (matches ATO record-keeping requirement). Skips already-anonymised rows; trashes Drive folders; audit-logged per row. Bookings list gains an "Archived" tab.
27. **PR#46 — calendar sync improvements.** ✅ New `updateCalendarEvent()` in `lib/integrations/calendar.ts`. `createCalendarEvent` now accepts attendees (talent + crew emails resolved at quote_confirmed). Google sends invites and update notifications to all attendees automatically (works for Apple users too — Apple Mail parses Google invites). `updateBookingAction` propagates shoot_dates / shoot_location edits to the existing Google Calendar event. `deleteBookingAction` now also removes the calendar event. `deleteCalendarEvent` uses `sendUpdates=all` so attendees see "Cancelled" in their inbox.
28. **PR#47 — crew + talent city ordering, collapsible groups, crew availability warning.** ✅ New `src/lib/utils/city-order.ts` orders city keys: anchors first (Sydney → Melbourne → Byron/Gold Coast → Adelaide), then frequency desc, alphabetical to break ties; "No city set" sinks last. Applied to `/crew` (was alphabetical) and `/talent` (was no grouping at all). New `CollapsibleCityGroup` client component with localStorage-persisted collapse state per city — click city header to collapse/expand. New `getCrewBookedOnRange()` data fetcher; booking detail page resolves it for the booking's shoot dates and passes a `crewConflictsByCrewId` map into `BookingTeam`, which now flags conflicting crew with a soft amber "⚠ Also on BOOK-0042" badge in the attached roster and the add-crew dropdown.
29. **Bookings list / calendar regression fixes (post PR#44).** ✅ Two visual bugs: calendar bars rendered as "BOOK..." / "B." stubs because the `BookingHoverCard` wrapper was inline-block with no width — the inner Link's percentage widths resolved against the wrapper, not the week row (fix: `wrapperStyle` prop, calendar passes the bar's absolute positioning to the wrapper, inner Link fills 100%). Calendar grid was sized to event content leaving 75% of the page empty — fixed with `height: calc(100vh - 240px); min-height: 620px` on the container and `flex: 1` on each week row so the 6 weeks share available height.
30. **Talent / crew detail header layout + smart title-casing.** ✅ Header restructured into three tidy rows (identity / status badges / actions). "Send onboarding link" button now hides when `onboarding_completed = true` (was contradicting the Onboarded badge). Stats moved to bottom of page (reads as a summary after the booking history detail). `titleCaseName` rewritten to respect intentional mixed-case input: when the WHOLE input is uniformly upper or lower it title-cases everything (CSV bulk-data behaviour preserved); when it's intentionally mixed it preserves any token that isn't pure lowercase ("WPP Production" stays as "WPP Production" instead of "Wpp Production"). 3 new tests cover the rule.
31. **Dashboard redesign — artist-first.** ✅ Replaced the four-stat-card grid + side-by-side Upcoming/Activity layout with a top-down narrative: (1) health banner [unchanged], (2) "Needs attention now" — single prioritised list combining overdue invoices + attention items + pending approvals, (3) "This week" — upcoming shoots in the next 7 days with primary artist surfaced, hover-pin tooltip with full team contact + copy buttons (reuses `BookingHoverCard`), (4) "Pipeline at a glance" — three KPI cards with month-over-month delta on revenue, (5) "Top artists" — horizontal scrollable strip of most-booked talent (artist-first emphasis), (6) Recent activity — collapsed `<details>` because most of it is automation noise. Fetches roster for the upcoming shoots in one batched call (no N+1).
32. **Privacy compliance — APP-aligned policy + collection notices + data rights (PR#48–50).** ✅ Public `/privacy` page covering APP 1.4(a)–(g), 2, 7, 8, 11, 12, 13. New `CollectionNotice` component on both `/onboard` paths and a privacy footer on `/q/[token]`. Self-service export on `/api/export/talent/[id]` and `/api/export/crew/[id]` for the entity themselves (APP 12.1 at zero charge per APP 12.7). New `<PortalDataRights>` panel on `/portal/talent` + `/portal/crew` with one-click "Download my data" + mailto-based "Request anonymisation". Three operational docs in `/docs`: `INCIDENT-RESPONSE-PLAN.md` (NDB scheme playbook), `PRIVACY-CONTACT-SETUP.md` (one-time `privacy@` mailbox checklist), `EMAIL-SIGNATURE-PRIVACY-FOOTER.md` (APP 5 email channel notice). Saunders & Co is below the $3M small-business threshold so legally exempt — published policy is voluntary best practice / competitive moat with corporate clients.
34. **Performance — DB indexes + SQL aggregations + unstable_cache (PR#52).** ✅ Three-fix bundle targeting dashboard load latency. Migration 0028 adds 6 missing btree indexes on FK/lookup columns (`booking_talent.talent_id`, `booking_crew.crew_id`, `usage_licences.booking_id`, `audit_log.record_id`, `fee_lines.talent_id × 2`). Two new Postgres RPC functions (`get_booking_state_counts`, `get_report_summary_agg`) replace JS-side aggregation that was pulling every booking row into Node — single DB round-trip for all dashboard KPIs with JS fallback paths for pre-migration dev. New `src/lib/data/dashboard-cache.ts` wraps both with `unstable_cache` (60s TTL, `tags: ['bookings']`, service client); dashboard page uses cached versions. `revalidateTag('bookings', {})` added to all 13 booking write paths for immediate cache bust on any mutation.

33. **Workflow tools — this-week revenue + tone preview + tomorrow's-shoot digest + quote PDF + brief auto-detect (PR#51).** ✅ Five things in one bundle: (a) Dashboard gains a fourth KPI card "Revenue this week" — confirmed bookings whose shoot dates intersect Mon-Sun; new `revenueThisWeek` field on `getReportSummary()`. (b) `<EmailTonePreview>` on `ClientEditForm` — live preview of a Day 7 quote-chase email rendered in the selected tone (formal / casual / terse), reuses `buildQuoteChaseEmail` so what shows is what sends. (c) New `/api/cron/tomorrow-digest` (daily 20:00 UTC = 06:00 AEST) — emails Jasper a digest of every shoot happening tomorrow with full team contact details, dietary, drink orders. Internal email (no approval gate). Skips silently on empty days. (d) New `/api/print/quote/[id]` PDF download endpoint — uses puppeteer-core + @sparticuz/chromium for serverless rendering of the existing `/print/bookings/[id]/quote` HTML to A4 PDF. "Quote PDF" button in booking detail Tools row. (e) Brief auto-detect Option B: new `<PotentialBriefs>` panel on `/inbox` lists Gmail messages matching brief / RFP / shoot keywords from the last 14 days; one-click "Convert to booking" pulls the email body via new `getMessageBody()`, creates a `brief_received` booking with `brief_raw_text` set, redirects to detail page. Heuristic-based with human dismissal — never auto-creates. New `getMessageBody()` MIME-walker + `findPotentialBriefs()` in `gmail.ts`. New `convertEmailToBookingAction` server action (owner/partner only). New `TOMORROW_DIGEST` per-cron secret slot.

35. **Portal interactivity (PR#64).** ✅ Migration 0037. Talent and crew can respond to hold requests (Accept/Decline) directly in their portal. Talent confirms day rate via form (shown for `artists_crew_held` → `shoot_live` states) and acknowledges the artist brief (`pre_production` / `shoot_live`). Crew self-reports unavailability date ranges with optional reason — blocks merge into `crewConflictsByCrewId` in BookingTeam so the owner sees "Unavailable (self-reported)" alongside booking-based conflict hints. Both portals show a digital call sheet for upcoming shoots (location, date, full team + clickable mobile numbers). Gallery-share cron extended to also ping confirmed crew with digital/editing roles (`digital_operator`, `photo_editor`, `video_editor`, `retoucher`, `digi_tech`); new `crew_gallery_share_request` action type + handler.

36. **Workflow UX: per-job P&L + morning-after urgency + quick email compose + talent substitution (PR#65).** ✅ (a) `JobPnLPanel` on every booking detail — Quoted vs Actual grand total, Commission/ASF/Super spread breakdown, revenue drift $ and margin drift pp (drift rows hidden until OT/expense lines exist). (b) Dashboard attention panel shows a red "OT window closes in Xh" badge on `morning_after_check` items; link anchors to `#morning-after`. (c) `QuickCompose` panel on booking detail (collapsed by default) — pre-fills To/Subject from booking context, Send now or Draft, kill-switch checked on send, audit-logged, graceful fallback when Gmail not connected. (d) Amber "Substitute" button on each talent row in BookingTeam — inline panel with required reason, replacement talent select, optional day rate override; `substituteTalentAction` writes `talent_substituted` audit row with `old_talent_id`, `new_talent_id`, `reason`.

37. **Kill switch UX + Realtime banner + audit deep-link (PR#114).** ✅ Three connected fixes to `/settings`: (a) Toggle felt broken (~10s lag) — root cause was no local optimistic state in `SettingsPanel`. Fix: React 19 `useOptimistic` flips the toggle immediately and auto-syncs to the server prop after `router.refresh()` completes. (b) Banner didn't appear without manual refresh — root cause: `atelier_kill_switch` was not in the `supabase_realtime` publication so the `postgres_changes` subscription was silent. Migration 0050 adds the table + sets `REPLICA IDENTITY FULL`. (c) "X email operations failed" banner showed only action names; now each is a link to `/audit?action=<name>` so the captured error is one click away. Migration 0050 applied to prod via Supabase MCP.

38. **Redesign PR-1 — shared DenseListTable across 5 list pages (PR#115).** ✅ Talent / Crew / Clients / Locations all used 3-column card grids that ate vertical space (a 50-row talent list filled 5+ screens). New shared component `<DenseListTable>` at `src/components/ui/DenseListTable.tsx`: generic, type-safe, with sortable sticky-header dense rows (~5× density vs cards), inline filter bar, optional grouping with localStorage-persisted collapse, mobile-responsive `hideBelow` per column. Each page provides bespoke columns + filters; chrome is shared. Audit kept server-paginated (URL form filters + Link pagination) but restyled to match the dense visual idiom inline. All 5 pages now navigate by clicking a row → detail page.

39. **Redesign PR-2 — shared KpiCard + SectionCard across 5 overview pages (PR#116).** ✅ Dashboard / Reports / Compliance / Renewals / Costs now share one visual idiom: KpiStrip (4 small cards) at top, SectionCard content below. New components in `src/components/ui/`: `KpiCard` (small-label / large-number / optional sub / optional accent or tone tint / optional href click-through) + convenience wrapper `KpiStrip` (2-col mobile, 4-col desktop) + `SectionCard` (title + optional meta + optional action link + body, tighter than the previous `<section class="p-5">` pattern). Changes per page: Dashboard tightened (`space-y-6` → `space-y-4`); Reports got 4-col xl grid for bottom breakdowns + side-by-side win-rate + 12-month chart; Compliance + Renewals gained KPI strips they didn't have before + lost `max-w-5xl` width caps; Costs gained KPI strip + per-agent grid expanded to 4-col on lg.

40. **Redesign PR-3 — Settings + Inbox dense layouts (PR#117).** ✅ Settings was the user's main complaint — 7 sections stacked vertically, `max-w-2xl` constraint, kill-switch toggles below the fold. Now: KpiStrip showing Kill switch level + Google integration + Scheduled jobs (X/8) + Email failures; 3-col row (Admin · Kill switch toggles · Push notifications); 2-col row (Agency profile · Fee defaults); full-width Integrations and Scheduled Jobs (cron status now in a 4-col grid below sm). Toggle component shrunk (h-5 w-9) to fit the 3-col layout. Inbox got a KpiStrip (Pending / Approved / Rejected / Potential briefs) and tab pills inline as the section meta (each pill shows its count). `PotentialBriefs` only renders when there are candidates. Grid Planner deferred — its 600-line internals are out of scope for chrome-only redesign.

41. **Dismiss brief persistence + Convert-to-booking undo (PR#118).** ✅ Bug fix + doctrine establishment. The PotentialBriefs panel was dismissing candidates in React local state only, so they all reappeared on refresh. Migration 0051 creates `atelier_dismissed_brief_candidates` (PK on gmail_message_id, RLS owner/partner) and adds `source_gmail_message_id` to `atelier_bookings`. `findPotentialBriefs` now accepts `dismissedIds` and `convertedSourceIds` sets and filters server-side. Two undo layers: 8s toast + "Show N dismissed" persistent recovery toggle. Convert-to-booking gets an "Undo conversion" affordance on the booking detail page when state=brief_received AND source_gmail_message_id is set AND <24h since creation. New `UndoConversionButton` is two-click amber confirm; deletes the booking (FK cascade) so the email re-appears in the next scan. Established the reversibility doctrine: actions undoable UNTIL external side effect; toast + persistent recovery layers.

42. **Undo trio: reject-approval + delete-fee-line + delete-schedule-row (this PR).** ✅ Applies the PR#118 undo pattern to the next three highest-impact one-click actions. New shared `<UndoToast>` component in `src/components/ui/` factors out the visual idiom from PotentialBriefs. (a) **Reject approval**: New `undoRejectApprovalAction` server action sets status back to `pending` (safe because rejection has no external side effects — `applyApprovalDecisionEffects` returns early on decision≠'approved' for every action_type). ApprovalQueue now shows a toast for 8s after reject + a persistent "Restore to pending" button on every rejected row in the Rejected tab. Reason `prompt()` dialog removed — the toast undo is the new safety net. (b) **Delete fee line**: New `restoreFeeLineAction` recreates a deleted line with a new ID; client caches the full FeeLine row pre-delete and replays it on Undo. `confirm()` removed. (c) **Delete schedule row**: client caches the BookingSchedule row, replays via `upsertScheduleAction` on Undo (upsert handles the create case via (booking_id, schedule_date) conflict). `confirm()` removed. Bonus tightening: ApprovalQueue card padding p-4→p-3 + summary spacing mt-1.5→mt-1. Locations empty-state regained inline "Add first location" CTA via new `emptyCta` prop on DenseListTable.

## Build status (updated 2026-05-15, session 14)

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
- Print templates: quote, invoice, artist brief, crew brief, booking confirmation — light-mode forced regardless of app theme
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
- **Performance — DB indexes + SQL aggregations + unstable_cache (PR#52):** Migration 0028 adds 6 btree indexes. Two Postgres RPC functions (`get_booking_state_counts`, `get_report_summary_agg`) replace JS-side aggregation. `dashboard-cache.ts` wraps both with `unstable_cache` (60s TTL, tag-busted on every booking write path).
- **Crew detail UX (PR#53):** Two-column grid on crew detail page. Multi-role display in "Digital Operator / Assistant" format. `secondary_roles` edit form converted from free-text to checkboxes using `CREW_ROLES` enum.
- **Per-artist preferred crew (PR#54):** Migration 0029 `atelier_talent_preferred_crew` table. `listPreferredCrew`, `listPreferredCrewIds`, `addPreferredCrew`, `removePreferredCrew` data layer. `PreferredCrewPanel` on talent detail page. `BookingTeam` picker groups crew into `<optgroup>`s (artist's preferred first, then all crew), sorts preferred first + local crew first.
- **Workflow: use-as-template + pre-flight quote gate + Drive deep-links (PR#55):** `CloneBookingButton` wired into Tools row in `BookingDetail` ("Use as template"). `SendQuotePanel` now two-step: pre-flight modal checks recipient email (blocker), talent attached, fee lines, total, deliverables, usage licences — red blocks, amber warns, green proceeds. Drive ↗ button added to talent / crew / client / booking detail pages; hidden when `drive_folder_link` is null.
- **Portal interactivity (PR#64):** Hold responses, rate acceptance, brief sign-off in talent/crew portals. Crew self-reported unavailability visible in BookingTeam. Digital call sheets in both portals. Gallery-share cron covers crew with digital roles. Migration 0037 applied.
- **Workflow UX (PR#65):** `JobPnLPanel` (quoted vs actual + margin drift), morning-after urgency badge on dashboard, `QuickCompose` on booking detail, inline talent substitution with audit trail.
- **Security + UX hardening (PR#66):** Auth guards on `markTalentPaidAction`, `markCrewPaidAction`, `sendQuickEmailAction` (owner/partner only); booking state check on payroll actions; server-side email format validation; same-artist guard in `substituteTalentAction`; `confirmed_at` timestamp on talent hold confirmation (migration 0038); `JobPnLPanel` shows `—` for zero-total margin; `HoldCard` error is now dismissable.
- **Syngency-inspired features (PR#74):** Six features in two commits. (1) 5-tab booking detail restructure — `BookingTabs` client component organises the page into Overview / Team / Documents / Comms / Activity; all content SSR'd, tab switching is instant via HTML `hidden` attribute. (2) Quote accept/decline on `/q/[token]` — `QuoteActions` client component lets clients self-serve accept (→ `quote_confirmed`) or decline (→ `released`) with agency email notification; state-aware rendering. (3) Talent bookouts — `atelier_talent_unavailability` (migration 0040) mirrors crew pattern; `TalentUnavailabilityManager` in talent portal; `BookingTeam` shows amber unavailability badges. (4) Tasks system — `atelier_tasks` (migration 0041) polymorphic booking/talent/crew attachment; `TasksPanel` with open/done toggle, delete, add form, colour-coded due dates; wired on booking detail (Team tab), talent detail, crew detail. (5) Booking Confirmation print template — `/print/bookings/[id]/confirmation` with creative team, usage licences, fee totals, dual signature blocks; linked from BookingDetail tools row. (6) Per-day schedules — `atelier_booking_schedules` (migration 0042) with call/wrap/location/notes per shoot day; `SchedulesPanel` with date picker locked to shoot range; upsert on `(booking_id, schedule_date)` conflict; in Team tab.
- **Comprehensive audit + 6 fix PRs (post-session 12, 2026-05-14):**
  - `docs/AUDIT-2026-05-14.md` — full platform audit covering PRs #60–#85; 0 P0, 11 P1, 13 P2 findings.
  - PR-A: `requireOwnerOrPartner()` guard on all 14 entity mutations (entities.ts) + 3 location mutations (locations.ts) + auth + logAudit on locations. `revalidateTag('bookings', {})` added to all 8 portal actions.
  - PR-B: `SchedulesPanel.handleDelete` confirm dialog. New `ArchiveCrewButton` component. Crew detail action row gains Archive button. Client detail header rebuilt to 3-row structure (identity / badges / actions) matching talent/crew pages.
  - PR-C: `HoldExpiryBadge` timezone fix — AEST/AEDT resolved dynamically via Intl (was hardcoded +10:00). >7d color changed muted → success (green). `BookingDetail` client chip renders `<span>` not `<Link href="#">` when no client.id.
  - PR-D: `logAudit('quote_accept_by_token')` + `logAudit('quote_decline_by_token')` in quotes-public.ts. `key={filter}` on `<ApprovalQueue>` in inbox. `BookingTabs` syncs active tab to `?tab=` URL param.
  - PR-E: Hardcoded hexes replaced in ApprovalQueue (#6b6b6b), SeedButton (#262626/#8b8b8b), BookingsCalendar (#404560). Five inline-styled `<h3>` headings converted to `.section-title` class.
  - PR-F: `JobPnLPanel` shows empty-state card when no quote (was null). Paid Out row hidden when zero. QuoteBuilder drag handle opacity raised (0.35→0.55) + tooltip added.
- **PR#87 — print template fixes + artist portal fees + PDF performance:**
  - PR-1: Removed incorrect "Incl. Super (15%)" sub-label from Quote PDF and `/q/[token]` viewer fee lines. Reordered totals GST before Crew Fringes. Renamed "Superannuation" → "Crew Fringes" on Quote + Invoice.
  - PR-2: Category grouping (Photography & Artist Fees / Crew & Labour / Production Expenses) added to Quote PDF and Booking Confirmation PDF, matching Invoice format.
  - PR-3: Booking Confirmation PDF reworked as proper client-facing document: removed individual talent day rates, added DRAFT watermark for pre-confirmed states, full totals breakdown (ASF + GST + Crew Fringes).
  - PR-4: Artist portal now shows collapsible fee details per booking — own fee lines + equipment lines so artists know their budget.
  - PR-5: Shared `pdf-renderer.ts` utility (blocks images/fonts, uses `'load'` not `'networkidle0'`). New `/api/print/invoice/[id]` + `/api/print/confirmation/[id]` endpoints. BookingDetail tools row has "Print X" + "X PDF ↓" for all three document types. `loading.tsx` skeleton for print routes.
- **PR#88 — QuoteBuilder edit-row redesign + UI polish pass:** Edit row redesigned from 10-column squeeze to single-cell `colSpan` layout (no more input/preview bleed). Sticky totals panel pins Grand Total to viewport bottom on long quotes. Drag handle opacity 0.55→0.75. Three hardcoded `#C4A882` checkbox accents replaced with `PALETTE.accent`/`PALETTE.ok`. BookingDetail tools row collapsed 6 print/PDF buttons into single `Print & PDFs ▾` dropdown (new `PrintDocsMenu` using native `<details>`). SchedulesPanel call/wrap row uses `whitespace-nowrap` single line.
- **PR#89 — QuoteBuilder edits not propagating across booking page:** `commitEdit` was missing `router.refresh()` after successful save. The fee-line table updated optimistically but JobPnLPanel and other panels kept showing stale prop data. Added `router.refresh()` to `commitEdit`, `handleRemoveLine`, and `handleReorder` after successful actions. `type="button"` on Cancel/Save defensively.
- **PR#90 — Block reimbursement on commissionable lines + split overtime artist/crew:** Commissionable lines (artist labour) can never be flagged as reimbursements — enforced in QuoteBuilder edit row (hides checkbox, auto-clears flag on type change), AddLineForm (hides checkbox), and addFeeLineAction/updateFeeLineAction server-side coercion. Migration 0046 adds `artist_overtime` enum value. `artist_overtime` is commissionable; `overtime` stays as crew OT (non-commissionable, super-bearing). Label "Overtime" → "Crew Overtime"; new "Artist Overtime". Print template grouping + JobPnLPanel sets put artist_overtime under artist fees.
- **PR#91 — Surface real DB error on fee-line save + auth guard + validation:** The generic "Failed to update fee line" message was masking the real cause (RLS denial, enum mismatch, constraint failure) for multiple iterations. `updateFeeLine` data layer now returns `{ ok: true; data } | { ok: false; error: string }` with actual Supabase `message · code · details · hint`. All fee-line mutations now run `requireOwnerOrPartner()` first — clear "Not authorised (role: X)" instead of opaque RLS denial. `updateFeeLineAction` validates qty / unit_price / asf_rate up front. Action return types normalised to `{ ok: true } | { ok: false; error: string }`.
- **PR#99 — Fix all P1s and P2s from AUDIT-2026-05-14B (PRs A–E):** Full resolution of the second comprehensive audit session (17 P1s + 13 P2s). Five thematic groups: (A) Quick wins — `QuoteActions` refresh after accept/decline, dashboard attention items sorted by urgency, `StageChecklist` optional items grey not amber, `BookingTeam` empty state copy, compliance revalidatePath. (B) Notification gaps — onboarding completion creates `onboarding_review` inbox item, hold accept/decline in portals creates `hold_response_notify` notification. (C) Data correctness — `updateBookingAction` auto-upserts schedule rows on shoot_dates change, `proposeHoldRequests` awaited with full error handling, `HoldExpiryBadge` 60s interval for live expiry refresh. (D) UX polish + infrastructure — GridPlanner localStorage (captions/labels/status persist, images session-only), `/q/[token]` shows expiry date, QuoteBuilder ASF tooltip, SchedulesPanel override label, ApprovalQueue inline recipient, Settings Gmail failure banner + cron health table, all 8 cron routes emit `cron_<name>_run`/`_complete` audit entries. (E) Email + batch — `buildRemittanceEmail()` in comms-tone.ts, `markTalentPaidAction`/`markCrewPaidAction` send remittance advice (kill-switch gated), `approveAllHoldsAction(bookingId)` batch-approves hold requests, BookingTeam "Approve all holds (N)" button.

### In progress / partially wired
- Gmail outbound: wired, needs GOOGLE_REFRESH_TOKEN credentials set
- Xero: OAuth registered; **invoice sync not yet live** (Phase 2, awaiting credentials)
- Quote templates: photographer + videographer; no usage/grading/equipment lines yet
- Repeat-client autofill on new booking: in progress

### Deferred to follow-up PRs
- ~~**RLS lockdown (Phase 5b)**~~ — actually already shipped (migrations 0018 + 0019, see entry #6 above). The earlier wording that this was "intentionally still in place" was stale doc rot. `auth_full_access` was dropped; `is_owner_or_partner()` is the gate on admin tables; self-scoped policies are live for talent + crew. Residual work is portal end-to-end testing, not a migration.
- ~~Tier-2 features #13 / #15~~ — resolved 2026-05-06: those numbers referred to PR #13 (already shipped previous session: agency margin clarity, per-line ASF toggle, print bg, save refresh) and PR #15 (shipped this session: hard delete + corpus archival). Not pending features.
- **Phase 2 (Xero)** — blocked on credentials. Three env vars needed:
  `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`
  (must match `https://atelier.saundersandco.com.au/api/auth/callback/xero`).
  After OAuth flow runs once, `XERO_REFRESH_TOKEN` and `XERO_TENANT_ID`
  are persisted automatically.
- **Phase 7 (production polish)** — performance, monitoring, edge cases. Standing checklist: tsc clean, tests green, no TODO/FIXME left behind, no hardcoded names/data, AJE eComm #3579 canonical test still passes.

## Forward roadmap (clean — descoped items removed)

What's actually still ahead, in priority order:

1. **Pay-on-paid tracking** — flip a flag when client invoice marked paid in Xero. Remittance advice email on `markTalentPaidAction`/`markCrewPaidAction` now ships automatically (PR#99). The Xero-triggered flag-flip still depends on Phase 2 (Xero credentials). Blocked.
2. ~~**Quote template expansion**~~ — stylist + HMU shipped PR#28; further expansion (manicurist-specific, prop stylist, set design) only if Jasper books those disciplines often enough.
3. ~~**Comms agent expansion**~~ — quote-chase PR#33, brief-clarify PR#34, tone variants PR#36, gallery-share PR#37. All comms agent items shipped.
4. ~~**Insurance / BAS reminders dashboard**~~ — shipped PR#34 at `/settings/business-renewals`.
5. ~~**Talent / crew expiry-renewal automated pings**~~ (passport, licence, WWCC, visa) — shipped PR#27 as `/api/cron/compliance-pings` (daily 22:00 UTC). Drafts approval-gated emails to talent with documents expiring ≤30d.
6. ~~**Data export / right-to-be-forgotten**~~ — shipped PR#35 (`/api/export/{talent,client}/[id]` + `anonymise{Talent,Client}Action` + `<DataRightsControls>` panel on detail pages).
7. ~~**Tone variants per client**~~ — shipped PR#36. `communication_style` on clients, `comms-tone.ts` utility, all three automated email types branched.
7. **Microsoft Graph webhooks** (replace polling — currently no MS Graph code in the build).
8. ~~**Full agent prompt suite**~~ — first slice shipped PR#32 (brief-intake `ConfidenceContract`, hold-requests `precedent_refs`). Send-quote critique-pass not added — body is template-driven, low signal.
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
