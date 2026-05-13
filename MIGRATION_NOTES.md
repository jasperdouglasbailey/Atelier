# MIGRATION_NOTES — Atelier redesign spec v1.1 audit
_Generated: 2026-05-13 | Phase 0 only — no production code written_

---

## Current schema

### Tables (prefixed `atelier_`)
From migration 0001 + subsequent additions:

| Table | Notes |
|---|---|
| `atelier_clients` | client companies |
| `atelier_brands` | brands under clients |
| `atelier_client_brands` | join |
| `atelier_talent` | represented artists |
| `atelier_crew` | freelance crew |
| `atelier_campaigns` | campaign groupings |
| `atelier_bookings` | 16-state booking pipeline; 43 migrations deep |
| `atelier_booking_talent` | separate join table (not unified engagements) |
| `atelier_booking_crew` | separate join table with `assigned_dates DATE[]` |
| `atelier_quote_versions` | versioned quote containers |
| `atelier_fee_lines` | quote line items (maps to spec's `quote_lines`) |
| `atelier_usage_licences` | usage licence detail |
| `atelier_events` | calendar events (Google Calendar IDs) |
| `atelier_approvals` | inbox approval queue |
| `atelier_kill_switch` | Red/Amber/Green signal |
| `atelier_audit_log` | all mutations logged here (maps to spec's `activity`) |
| `atelier_llm_calls` | LLM usage tracking |
| `atelier_idempotency_keys` | dedup keys for approvals |
| `atelier_corpus_bookings` | anonymised financial history (privacy compliance) |
| `atelier_locations` | studio locations |
| `atelier_app_users` | owner/partner/talent/crew roles |
| `atelier_business_renewals` | insurance, BAS, domain renewals |
| `atelier_talent_preferred_crew` | per-artist crew preferences |
| `atelier_talent_unavailability` | talent bookout date ranges |
| `atelier_booking_crew_unavailability` | self-reported crew unavailability |
| `atelier_tasks` | tasks attached to bookings/talent/crew |
| `atelier_booking_schedules` | per-day call/wrap/location — **already exists** (migration 0042) |

### Booking state machine (actual — 16 states)
```
brief_received → brief_parsed → quote_drafted → quote_sent →
artists_crew_held → quote_confirmed → pre_production →
shoot_live → morning_after_check → post_production →
final_delivery → invoice_issued → paid
                                     → released
                                     → cancelled
                                     → written_off
```

### Current font setup
- Body: system font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`) — **not** DM Sans
- Display/H1: inline `Georgia, "Times New Roman", serif` fallback — **not** Fraunces (the real font is not loaded)
- Mono: Geist Mono loaded via Next.js default — **not** DM Mono

### Current palette tokens
```css
--p-bg:      #F5F0E8  (warm cream — close to spec's --paper #F8F7F4)
--p-surface: #EDE8DC  (close to spec's --paper-2 #F2F0EA)
--p-border:  #D4CEC3  (close to spec's --rule #DAD5CC)
--p-text:    #1C1A17  (close to spec's --ink #0E0E0C)
--p-muted:   #7A7060  (close to spec's --mid #6B6862)
--p-accent:  #6c8aff  ← BLUE — spec forbids all blues
```
The token *names* differ from the spec, and accent is blue.

---

## UI violations

Cross-referenced against spec §12 pre-flight checklist. Every item that fails is listed with file references.

### 🔴 Critical violations

**V1 — Accent colour is blue (#6c8aff)**
Files: `src/lib/utils/constants.ts` (PALETTE.accent), `src/components/layout/Sidebar.tsx` (badge background). Spec §3.3 says "No blues. No purples." and §3.2 says accent is sand `#C4A882` only.

**V2 — STATE_COLORS are all blue/purple/pink spectrum**
File: `src/lib/utils/constants.ts` (STATE_COLORS). These map to booking states and appear on calendar bars and board cards. Spec §3.3 forbids all of these colours. They need mapping to status-semantic colours only (ok/warn/danger) or ink/mid.

**V3 — Fraunces font is not loaded**
File: `src/app/layout.tsx`. Body uses system fonts; H1 uses inline `Georgia` fallback. The actual Fraunces typeface is never fetched. Result: spec's primary typographic intent is entirely absent.

**V4 — DM Sans and DM Mono are not loaded**
Same as V3. Body uses system sans, mono uses Geist. All three font families need adding via Google Fonts `<link>` in root layout.

**V5 — Per-row Save button in CrewDayPicker**
File: `src/components/bookings/CrewDayPicker.tsx:63-71`. The crew day picker added in the last session has an explicit "Save" button. Spec §5.14: "Eliminate every per-row Save button."

**V6 — Analytics/System sidebar groups not numbered**
File: `src/components/layout/Sidebar.tsx`. Numbers 01–08 appear on the primary nav; Analytics (`09 Reports`, `10 Costs`) and System (`11 Compliance`…`14 Settings`) are unnumbered. Spec §5.2 requires continuous numbering through all sections.

**V7 — Sidebar active state uses border background, not sand left bar**
File: `src/components/layout/Sidebar.tsx:50`. Active state: `background: 'var(--p-border)'`. Spec: `2px sand left bar + rgba(196,168,130,0.10) tinted background`. Fundamentally different visual treatment.

**V8 — Inbox badge is blue (--p-accent)**
File: `src/components/layout/Sidebar.tsx:74`. Badge uses `background: 'var(--p-accent)'` which is blue. Spec §5.2 requires a hairline pill (`paper bg, 1px rule border, mono text, no colour fill`).

### 🟡 Significant violations

**V9 — No footer strip ("AUTO-SAVED ●") on any page**
Spec §5.17 requires a sticky footer strip on every page showing last edited, owner, booking ID, auto-save indicator. Currently absent entirely.

**V10 — Action cluster is not implemented per spec §5.15**
Current: `BookingAdvanceButtons.tsx` has multiple individual buttons for each transition. Spec: single primary `stage-action` button + split `▾` + overflow `⋯`. The spec's pattern collapses everything into one compound control.

**V11 — Booking state labels don't map to 6-stage display**
Spec's stage stepper shows: `Enquiry → Quote → Pre-Production → Shoot → Post → Wrap`. The actual machine has 16 internal states. The stepper needs a mapping layer — currently `StageStepper.tsx` shows the internal state labels, not the 5-stage editorial labels.

**V12 — Overview tab: Job Facts is in a side panel, not a 3×2 grid below What's Left**
Current: `BookingJobFacts` is a right-column component. Spec §6.1 / §5.10: Job Facts is a full-width 3-column × 2-row hairline grid directly below What's Left in the main column. The right rail is Calendar + Activity, not Job Facts.

**V13 — Right rail of Overview has no calendar or activity feed**
Spec §6.1: right rail = calendar + activity. Currently: right column has `BookingJobFacts` (the inline editing panel from last session). The calendar component for the right rail does not exist.

**V14 — No monthly calendar component**
Spec §5.11 defines a full month-view calendar with shoot days, milestone dots, legend. This component does not exist anywhere in the codebase.

**V15 — Stage pill labels include state machine names, not editorial names**
`StageStepper.tsx` maps internal states to group labels (`brief`, `quote`, `production`, `delivery`, `closed`). Spec pill labels: `ENQUIRY`, `QUOTE`, `PRE-PRODUCTION`, `SHOOT`, `POST`, `WRAP`. Different labels, different groupings.

**V16 — Button styles are inconsistent across the app**
Many components use one-off inline styles or Tailwind utility combinations rather than the three spec tokens (`.btn-primary`, `.btn-ghost`, `.btn-danger`). The spec's button vocabulary is not implemented as reusable classes/components.

**V17 — No footer strip; "Auto-saved" concept is absent**
All mutations in server actions use `router.refresh()` or `revalidatePath()`. There is no client-side auto-save debounce, no saving indicator, no optimistic UI for field edits.

**V18 — Section titles inconsistent**
Some sections use `text-xs font-semibold uppercase tracking-wide` (close), others use different sizes. Spec §2.4: exactly `DM Sans 600, 13px, 0.06em tracking, uppercase`. Needs standardising.

**V19 — Micro-labels inconsistent**
Field labels like `CLIENT`, `SHOOT DATE` vary across components. Spec §2.5: `DM Mono 9px, 0.16em tracking, uppercase, --mid-2`. Not applied uniformly.

**V20 — Checklist items (StageChecklist) styling doesn't match spec**
`src/components/bookings/StageChecklist.tsx` — existing checklist. Spec §5.8 requires: 2-column grid, three-state boxes (done/partial/default), hint text in italic. Current implementation uses inline styles that differ.

---

## Open questions — require Jasper's input before any implementation

### OQ1 — Schema migration scope (CRITICAL — stop-work until resolved)

The spec §10 proposes a complete schema replacement:
- Merge `atelier_booking_talent` + `atelier_booking_crew` → `booking_engagements`
- Create `engagement_days`, `engagement_rates` (currently `assigned_dates DATE[]` array column)
- Replace `atelier_fee_lines` with restructured `quote_lines`
- Create `cashflow_entries`, `booking_milestones` (new tables)
- Treat `atelier_audit_log` as the `activity` table (different schema)

**The problem:** this codebase has 43 production migrations, a live fee engine with 79+ passing tests, full RLS lockdown, and a functioning approval/cron/email system — all built on the current schema. The spec was written without knowing this schema exists.

**The risk:** running the spec's schema migrations would require rewriting every data layer file (`src/lib/data/*.ts`), every server action (`src/app/actions/*.ts`), and every component that reads data. That is the entire application.

**Jasper must decide:** Is the schema migration (spec §10) in scope for this redesign, or is it deferred? The visual redesign (fonts, colours, layout, components) can proceed independently of schema changes. The schema redesign is a separate multi-week project.

**Recommendation:** Treat Phase 2 (schema) as explicitly out of scope for this design pass. Defer it with a dated note. The visual spec can be implemented 100% against the existing schema.

### OQ2 — Framework mismatch in handover instructions

The handover (`CLAUDE_CODE_HANDOVER.md`) describes a React/Vite project with:
- `index.html` for font loading
- `src/pages/` directory for route pages
- `.jsx` file extensions

The actual codebase is **Next.js 16 App Router** with:
- Fonts loaded via `<link>` in `src/app/layout.tsx` (or `next/font`)
- Routes in `src/app/(dashboard)/...`
- Strict TypeScript (`.tsx`)

The handover's phase instructions need to be reinterpreted for Next.js. This doesn't block work, but means the handover cannot be followed verbatim.

### OQ3 — 6-stage display vs 16-state machine

The spec shows a 6-pill stepper (`Enquiry → Quote → Pre-Production → Shoot → Post → Wrap`). The app has 16 internal states that drive the full workflow.

Options:
a) Keep 16 internal states, map them to 6 display stages for the stepper only (a presentation layer)
b) Collapse the state machine to 6 stages (high risk — breaks all cron jobs, approval logic, state-based checklists)

**Recommendation:** Option (a). The mapping already partly exists in `src/lib/utils/booking-stages.ts`.

### OQ4 — Auto-save everywhere vs server action model

The spec requires auto-save on every field (§5.14), eliminating all Save buttons. The current architecture uses Next.js server actions — mutations are explicit, not debounced client-side calls. True auto-save would require switching field editing to client-side Supabase calls with debounce, bypassing server actions.

**Jasper must decide:** Is auto-save a Phase 1 requirement, or a "nice to have" for a later pass? The booking overview edits (`BookingJobFacts`) could be wired to auto-save via Supabase client directly, but it needs explicit sign-off since it changes the mutation architecture.

### OQ5 — Kill Switch visibility

The spec (§5.3) says remove Kill Switch from topbar/nav and put it in `Settings → Advanced`. Currently: Kill Switch is in `src/app/(dashboard)/settings/page.tsx`. It's already in Settings — this may already be resolved. Confirm whether the Settings page is considered the right home.

### OQ6 — Crew Day Picker Save button

The handover says spec wins on auto-save. But the `CrewDayPicker.tsx` Save button was explicitly designed in the last session because per-day assignment is an intentional discrete write (not continuous). Should it be converted to auto-save (saves on any pill toggle) or is the explicit Save acceptable here?

---

## Summary — what can proceed now vs what needs decisions

### Safe to implement without further input (visual/typography only)
1. Load Fraunces, DM Sans, DM Mono via Google Fonts in `src/app/layout.tsx`
2. Rename and align palette tokens (`--p-xxx` → `--paper`, `--ink`, etc.) in `globals.css`
3. Update `PALETTE` constant in `constants.ts` to match new token names + swap accent from blue to sand
4. Remove blues from `STATE_COLORS` — map booking states to ink/mid/status colours only
5. Sidebar: number Analytics + System groups (09–14), fix active state to sand left bar, fix badge to hairline pill
6. Section title and micro-label standardisation across all components
7. Stage stepper pill labels → editorial names (Enquiry/Quote/Pre-Production/Shoot/Post/Wrap)

### Blocked pending Jasper's answers to OQ1–OQ6
- Schema migration (§10 entire section) — OQ1
- Auto-save everywhere — OQ4
- Full action cluster rewrite (§5.15) — depends on OQ3, OQ4

### Already substantially done (previous sessions)
- Warm cream light theme as default ✅ (token names differ, values close)
- Fraunces serif for H1 ✅ (Georgia fallback only — font not actually loaded)
- Numbered sidebar nav ✅ (01–08 only)
- Finance tab ✅
- Stage stepper pill chain ✅ (labels differ)
- 5-column detail strip ✅
- Two-column overview layout ✅ (Job Facts in wrong column)
- BookingPageHeader with action bar ✅
- CopyTeamButton ✅
- Multi-day crew picker ✅ (has Save button — spec wants auto-save)

---

_End of Phase 0 audit. No production code written. Awaiting Jasper's review._
