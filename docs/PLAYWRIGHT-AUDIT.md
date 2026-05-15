# Playwright Audit Playbook — Atelier
## 37-Dimension Full-Platform Review

> **For Claude (CLI session with Playwright MCP):** This is the canonical
> full-platform audit. Run it whenever Jasper asks you to "audit the platform"
> or after any significant deploy. Report findings as a ranked list with
> file:line where applicable; attach screenshots of anything that looks off.
>
> **Output format per finding:**
> ```
> [P0|P1|P2] [PAGE/URL] [DESCRIPTION] [FIX HINT / FILE:LINE]
> ```
> P0 = broken / data loss / can't proceed  
> P1 = wrong-but-not-broken, visible to user  
> P2 = polish, cosmetic, naming

---

## Pre-flight checklist

1. **Base URL.** Default `https://atelier.saundersandco.com.au`. If down, ask Jasper for the current Vercel preview URL.
2. **Authentication.** Jasper uses magic-link login. Ask him to start a session and provide a `sb-access-token` cookie value, then set it via `browser_set_cookie` before navigating. Alternatively he can hand over a fresh preview URL with an auth cookie baked in.
3. **Viewport passes.** Run the full pass at **1440×900** (desktop) and **390×844** (iPhone 14 Pro). Mobile is where layout bugs hide.
4. **Console errors.** Call `browser_console_messages` after each page navigation. A clean page produces zero red/yellow entries.
5. **Network.** Watch for any 4xx/5xx from `/api/*`, `/rest/v1/*`, `/auth/v1/*`. 401 on `/q/[token]` is fine if the token is expired; everywhere else it is a bug.
6. **Test data.** Use bookings prefixed `BOOK-TEST-` or whatever Jasper flags as disposable. Never mutate real financial data.

---

## Section 1 — Functional

### 1.1 Smoke tests (every page loads)

Navigate to each URL below. Screenshot. Confirm:
- HTTP 200, no full-page error boundary triggered
- No white/blank render (React hydration crash)
- At least one meaningful element visible in <3s

| URL | What to confirm |
|-----|-----------------|
| `/` | Dashboard renders KPI cards and "Needs attention now" list |
| `/inbox` | Approval queue with at least the filter tabs visible |
| `/bookings` | Calendar view is default; at least one booking bar visible (or empty-state) |
| `/bookings?view=list` | List renders with `BOOK-XXXX - Name - Campaign` title format |
| `/bookings?view=board` | Kanban columns render |
| `/bookings/[id]` | Booking detail 5-tab layout renders |
| `/talent` | City-grouped list renders |
| `/crew` | City-grouped list renders |
| `/clients` | Clients list renders |
| `/grid-planner` | Grid renders with slot placeholders |
| `/reports` | KPI cards + 12-month bars render |
| `/costs` | Renders (or redirects to `/reports` if merged) |
| `/audit` | Last 100 audit entries visible |
| `/settings` | Settings panel loads |
| `/settings/compliance` | Document expiry table renders |
| `/settings/business-renewals` | Business renewals table renders |
| `/settings/partners` | App users table renders |
| `/portal/talent` | Talent portal loads (sign in as talent test user) |
| `/portal/crew` | Crew portal loads (sign in as crew test user) |
| `/q/[token]` | Public quote page loads without auth (use a `quote_sent` token) |
| `/print/bookings/[id]/quote` | Quote print template renders (light mode) |
| `/print/bookings/[id]/invoice` | Invoice print template renders |
| `/print/bookings/[id]/confirmation` | Booking confirmation renders |
| `/print/bookings/[id]/call-sheet` | Call sheet renders |
| `/privacy` | Privacy policy renders |
| `/onboard` | Onboarding home renders without auth |
| `/onboard/[token]` | Onboarding form renders (use a live token from a talent row) |

### 1.2 Link integrity

On each page:
- Hover every `<a>` — confirm no `href="#"` on links that should navigate somewhere
- Click every sidebar link — confirm it navigates (no 404)
- Click every "back" / breadcrumb link — goes to parent
- Click external links (Drive ↗, Xero ↗) — open in new tab, no mixed-content error
- Click email links (`mailto:`) — your OS handles the protocol (not a JS error)

### 1.3 Navigation and routing

- **Tab sync.** On `/bookings/[id]`, switch tabs Overview → Team → Documents → Comms → Activity. Confirm the URL gains `?tab=overview`, `?tab=team`, etc. Hard-reload on `?tab=comms` — lands on Comms tab, not Overview.
- **View persistence.** Visit `/bookings?view=list`, navigate away, return. Confirm `bookings_view_pref` cookie restores list view.
- **Modal on reload.** Open the Edit booking form, copy URL, open in new tab — should open the booking page, not throw a modal error.
- **404 page.** Navigate to `/does-not-exist` — confirm the Next.js 404 page renders and the sidebar is present.
- **Role redirect.** If signed in as a talent/crew portal user and navigate to `/`, confirm redirect to `/portal/talent` or `/portal/crew`.

### 1.4 Cross-page data consistency

- Inbox badge in sidebar matches count of pending approvals visible at `/inbox`.
- KPI "Active bookings" on dashboard matches the non-archived, non-released bookings you can count on `/bookings?view=list`.
- A booking's state shown in the list/calendar matches the state shown on its detail page.
- A talent's name updated on `/talent/[id]` appears in the booking calendar bar and list title within one page refresh.

### 1.5 Edge cases and boundary conditions

- **Empty states.** Create/find a booking with zero fee lines — QuoteBuilder shows an "Add your first line" prompt, not a blank white area. Same for BookingTeam (no talent), SchedulesPanel (no dates), TasksPanel (no tasks).
- **Zero total.** A booking with $0 grand total should not show `NaN`, `Infinity`, or `–` in the KPI cards or P&L panel.
- **Long strings.** A talent name of 60+ characters should not overflow the calendar bar or the booking list title column.
- **Unicode.** Enter a client name with an apostrophe and a non-ASCII character (e.g. `Müller-O'Brien`). Confirm it saves, displays, and exports correctly.
- **Date boundaries.** A booking with a shoot date on 29 Feb (leap year) or 31 Dec should render correctly in the calendar grid.
- **Expired token.** Visit `/q/[expired-token]` — confirm a graceful "This quote has expired" message, not a 500.
- **Rate with no GST.** Add a crew member marked `gst_registered = false`. Their `crew_labour` line should have GST unchecked by default and not charge GST in the totals.

### 1.6 Cron job correctness

In the Audit log (`/audit`), look for recent cron entries:
- `cron_quote_chase_run` / `cron_quote_chase_complete` — ran within last 24h?
- `cron_compliance_pings_run` / `_complete`
- `cron_tomorrow_digest_run` / `_complete`
- `cron_talent_gallery_ping_run` / `_complete`
- `cron_post_shoot_chase_run` / `_complete`
- `cron_auto_anonymise_run` / `_complete`
- `cron_data_retention_run` / `_complete`
- `cron_lock_ot_windows_run` / `_complete`

Any missing from the last 48h is P1. Any `cron_*_failed` rows are P0.

In **Settings → System / Cron health** table: confirm each cron shows a last-run timestamp with green (ran today) / amber (ran within 48h) / red (never/older) badge.

### 1.7 Concurrent editing

- Open the same booking in two browser tabs. Edit the title in tab A, save. Without refreshing tab B, edit a different field in tab B, save. Both saves should complete without one overwriting the other (field-level server actions, not full-row replace).
- Open a fee line for editing in two tabs simultaneously. The second save should not silently corrupt the row.

### 1.8 Network conditions

Using browser DevTools (or Playwright's network interception):
- **Slow 3G.** Dashboard should show skeleton loaders, not a blank white page, while fetching.
- **Offline.** If navigating to a cached page while offline, show a clear "You are offline" message, not a generic network error.
- **API timeout.** If a Supabase call takes >5s, the form should not freeze permanently — it should eventually show an error state.

---

## Section 2 — UX

### 2.1 Information architecture

- **Sidebar grouping.** Items are grouped logically: Bookings / People / Tools / Settings / System. Confirm no orphaned links.
- **Tab ordering.** On booking detail: Overview → Team → Documents → Comms → Activity. Confirm this order matches the natural workflow sequence.
- **Settings sections.** Agency Profile / Google / Push Notifications / Cron Health / Kill Switch / Partners — confirm all six present, in a logical order.
- **Breadcrumbs.** On `/bookings/[id]`, the breadcrumb reads "Bookings / BOOK-0042". On `/talent/[id]`, reads "Talent / Name". Confirm correct on all detail pages.

### 2.2 Empty states, loading states, error states

For every list/table/panel on every page, there must be **three states** accounted for:

**Loading:** Skeleton placeholder or spinner — never a blank white box.  
**Empty:** Constructive message ("No bookings yet — create one with the button above."), not raw `null` or an empty `<ul>`.  
**Error:** "Something went wrong. Try refreshing." — never a raw Supabase error message exposed to the user.

Pages to spot-check:
- Dashboard KPI cards (loading skeleton vs NaN)
- ApprovalQueue in `/inbox` (empty state: "Inbox is clear")
- `/reports` revenue bars (empty state when no confirmed bookings)
- `SchedulesPanel` (empty state when no shoot dates set)
- `TasksPanel` (empty state vs "No tasks yet")
- `PrecedentSignals` (thin data: n<3 should say "Thin data — fewer than 3 jobs" not show garbage)
- `JobPnLPanel` (no quote: shows empty state card, not blank)

### 2.3 Workflow integrity (end-to-end flows)

#### Flow A — Brief → Quote → Send → Confirm

1. `/inbox` → Potential Briefs panel → click "Convert to booking" on a real email
2. Booking lands in `brief_received`; navigate to the new booking detail
3. Click "Parse brief" → fields auto-populated → state `brief_parsed`
4. Team tab → Add talent (e.g. Mason Williams); confirm HoldExpiryBadge appears with ≥7d (green)
5. Overview tab → QuoteBuilder → "Add line" → `artist_fee` $5000, ASF on, commission on
6. Add `crew_labour` $1000, ASF on, super on
7. Add `equipment_rental` $500, ASF on, GST always on
8. Grand total breakdown: Subtotal $6500, ASF 15% = $975, GST 10% on registered lines, super spread on crew labour only, commission 20% on artist fee only
9. Click "Send quote" → pre-flight modal → all green → Send
10. State → `quote_sent`, audit row `send_quote_email` written
11. Navigate to `/q/[token]` in incognito → "Valid until" date visible in footer
12. Click Accept → state → `quote_confirmed`

Watch for: ASF applied to GST-only lines; commission bleeding onto crew lines; totals mismatch between builder preview and stored `grand_total`.

#### Flow B — Hold → Portal response → Inbox notification

1. Confirmed booking → Team tab → propose hold for a crew member
2. Open `/portal/crew` as that crew user → Accept the hold
3. `/inbox` should show a `hold_response_notify` approval for Jasper
4. Sidebar inbox badge increments without page refresh (Realtime WebSocket)
5. Push notification fires in browser (if permission granted)

#### Flow C — Auto-save on entity forms

1. Open `/talent/[id]` → Edit form
2. Change "Instagram" field value, wait 2s
3. `Saving…` indicator appears → `✓ Saved` flashes
4. Hard-reload — change persists
5. Repeat for `/crew/[id]` and `/clients/[id]`

#### Flow D — Onboarding flow

1. Open a talent detail page → "Send onboarding link" button → link sent (or shown in audit log)
2. Open the `/onboard/[token]` URL → form pre-filled with existing data
3. Complete and submit → `onboarding_completed = true` in DB
4. `/inbox` shows an `onboarding_review` item for Jasper to review
5. "Send onboarding link" button is now hidden on the talent detail page (badge shows "Onboarded")

#### Flow E — Pay talent → Remittance email

1. Booking in `shoot_live` or later state → Team tab → "Mark paid" on a talent row
2. `artist_paid_at` stamped → audit row `mark_talent_paid` written
3. Audit log shows `remittance_email_sent` (or `remittance_email_failed` if Gmail down)
4. Check talent's email — should receive: "Hi [name], your fee of $X for [ref] has been processed."

### 2.4 Notification and feedback

- **Toast / success messages.** Every destructive action (archive, delete, anonymise) should confirm success with a toast or inline message, not just silently update the page.
- **Error messages.** Every failed save (validation error, network error, permission denied) shows a human-readable message, not a raw error code.
- **Confirm dialogs.** Archive, Delete (type `DELETE`), Anonymise (type `ANONYMISE`), Unarchive — all must have confirmation before proceeding.
- **Undo.** Is there any action where "undo" would be expected but isn't provided? Archive → Unarchive is the main one; confirm the Unarchive button is reachable from the Archived tab.
- **Badge counts.** Inbox badge in sidebar must match `/inbox` total. Verify by adding an approval and watching the badge update via Realtime.

### 2.5 Safety nets and destructive-action guards

- **Booking delete:** requires typing `DELETE`, only available in terminal state (released/archived). Test that the button is absent (or disabled) in `brief_received`.
- **Talent anonymise:** requires typing `ANONYMISE`. After completion, the talent row shows `Anonymised-XXXXXXXX` in all lists and booking history.
- **Drive folder trash:** anonymise should move the Drive folder to trash (check Drive, or check audit log for `drive_folder_trashed`).
- **Kill switch:** confirm the toggle on Settings page is present and labelled clearly (Red/Amber/Green). Do NOT flip to Red. Just confirm the dropdown/toggle renders.

### 2.6 First-time / onboarding UX

- Navigate to the app as if you have no bookings. Confirm Dashboard has an appropriate "Get started" empty state, not a broken KPI panel.
- `/talent` with zero talent — empty state has an "Import CSV" and "Add manually" prompt.
- New booking form — date picker shows today highlighted, no past dates blocking selection.

### 2.7 Power-user features

- **Keyboard navigation.** Tab through the booking edit form — all fields reachable, tab order logical, no keyboard traps.
- **Drag-and-drop.** In the QuoteBuilder, grab a fee line's drag handle and move it up/down. Confirm visual preview appears and order updates on drop.
- **Board view drag.** In `/bookings?view=board`, drag a booking card — confirm the drag preview renders. Do NOT drop into a state that would trigger an email.
- **Bulk approve.** On a booking with multiple pending hold requests, "Approve all holds (N)" button should be visible and clickable.
- **Use as template.** Click "Use as template" on any booking — new booking created pre-filled with the source booking's fields.

### 2.8 Naming and copy consistency

- All state labels use the same human-readable names everywhere (booking list, detail header, calendar legend, board column headers). No raw `snake_case` visible to the user.
- All currency is `$X,XXX.XX` AUD — no `$X` or `$X.0` or `X AUD` inconsistencies.
- Date formats: `15 May 2026` (d MMM yyyy) in user-facing copy; `2026-05-15` in URLs/IDs only.
- All buttons use sentence case ("Add talent", not "ADD TALENT" or "Add Talent").
- Section headings use `.section-title` (uppercase tracking-wide small caps). No mixed inline styles.

---

## Section 3 — Commercial

### 3.1 Financial accuracy — fee engine

The canonical test case: AJE eCommerce shoot #3579.

Verify the fee engine produces correct totals for:
| Line | Amount | Commission 20% | ASF 15% | GST 10% | Super (3% spread) |
|------|--------|----------------|---------|---------|-------------------|
| `artist_fee` $5000 | commissionable | ✓ | ✓ | follows artist GST status | ✗ |
| `crew_labour` $1000 | not commissionable | ✓ | ✓ | follows crew GST | ✓ on day rate |
| `equipment_rental` $500 | not commissionable | ✓ | ✓ | always GST | ✗ |

- ASF must NOT apply to the GST component (ASF is on the pre-GST subtotal only)
- Commission must NOT apply to crew or equipment lines
- Super spread (15% − 12% = 3%) only on `crew_labour` day rate, NOT on `overtime` (crew OT)
- `artist_overtime` IS commissionable; `overtime` is NOT
- `artist_travel` IS commissionable; `travel` is NOT

Verify these rules also apply in the print templates (Quote PDF, Invoice PDF, `/q/[token]`):
- No "Incl. Super (15%)" sub-label on individual lines
- Totals order: Subtotal → ASF → Commission → Crew Fringes → GST → Grand Total

### 3.2 Legal and regulatory compliance

- **ABN display.** Agency ABN appears on Quote PDF and Invoice PDF, sourced from `NEXT_PUBLIC_AGENCY_ABN` env var — never hardcoded.
- **GST.** "Tax Invoice" heading appears on Invoice PDF only when GST is charged. Quote says "Quote" not "Tax Invoice".
- **Super disclosure.** "Crew Fringes" row (15% charged to client, 12% paid to crew = 3% spread) is disclosed on invoices.
- **Privacy footer.** `/q/[token]` has a Collection Notice / privacy footer per APP 5.
- **Collection notice.** `/onboard` and `/onboard/[token]` show the `CollectionNotice` component.
- **Privacy page.** `/privacy` renders with all APP sections (1.4(a)–(g), 2, 7, 8, 11, 12, 13).
- **Data retention.** Confirm `/api/cron/auto-anonymise` is scheduled (check cron health table in Settings).

### 3.3 Print and PDF quality

For each print template:
1. Open at 1440px — no overflow, no text clipping
2. Open in print preview (`Ctrl+P`) — fits A4 portrait, no cut-off columns
3. PDF download button works — downloaded file opens and matches the print preview

Check specifically:
- Quote PDF: category grouping (Photography & Artist Fees / Crew & Labour / Production Expenses)
- Invoice PDF: "Tax Invoice" heading, agency ABN, GST summary row
- Booking Confirmation: DRAFT watermark present when booking not yet `quote_confirmed`; creative team listed without individual day rates
- Call Sheet: dietary and drink order shown per crew/talent row; role labels humanised (not `snake_case`)

### 3.4 Email deliverability

- **Send quote email.** Use the QuoteBuilder flow (Flow A above). Check the sent email in Gmail (via `/settings` → Google integration) — formatted correctly, agency signature present, `/q/[token]` link is clickable.
- **Quote chase.** Verify audit log has at least one `client_quote_chase_email_queued` entry for a booking in `quote_sent` state.
- **Tomorrow digest.** If there's a shoot tomorrow, check that `cron_tomorrow_digest_complete` appeared in today's audit log.
- **Remittance advice.** Flow E above — check the email format (casual Jasper voice, correct dollar amount).
- **From address.** All outbound emails show `from: Jasper` (not a Supabase default address or `noreply@vercel.com`).

### 3.5 Single source of truth

- **Booking title.** Removing a talent from a booking should update the formatted title `BOOK-0042 - [names] - [campaign]` in the list and calendar without a manual refresh.
- **Schedule rows.** Changing shoot dates on a booking should auto-upsert one schedule row per new date (SchedulesPanel should show the new rows after save).
- **Grand total.** Editing or reordering fee lines refreshes `JobPnLPanel` and the booking detail header total without requiring a page reload (relies on `router.refresh()` in `commitEdit`).
- **Inbox badge.** Any new approval created (hold request, brief clarify, compliance ping) immediately increments the sidebar badge via Realtime — no page refresh needed.

---

## Section 4 — Security

### 4.1 Security posture

- **Security headers.** Using the browser's Network tab (or `curl -I`), confirm:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Quote token entropy.** Check the `/q/[token]` URL — token should be at least 20 chars of random hex/UUID, not a sequential ID or a guessable pattern.
- **Quote expiry.** A token older than 180 days should return an expired state, not a live quote.
- **Rate limiting.** POST to `/api/onboard` more than 5 times in 10 minutes from the same IP — should return 429, not 200.
- **Google OAuth CSRF.** Start the OAuth flow at `/api/auth/start/google` — confirm a `state` cookie is set. Simulate a forged callback (omit or mismatch the `state` param) — should return 400 or redirect to an error page.

### 4.2 Permissions and privacy

- **RLS check.** Sign in as a portal talent user. Try to fetch `GET /rest/v1/atelier_bookings?select=*` — confirm the response is either 0 rows or restricted to the portal view columns only (id, booking_ref, title, tier, state, shoot_dates, shoot_location, deliverables_*). Fields like `grand_total`, `agency_notes`, `brief_raw_text` must not appear.
- **Portal scope.** In `/portal/talent`, confirm there is NO visible agency fee total, no `agency_notes` field, no other clients' names.
- **Owner-only actions.** Actions that require `requireOwnerOrPartner()` include: all booking mutations, all entity mutations, all approval mutations, send-quote, print-and-PDFs. Attempting them as a talent/crew session should return 403 or redirect.
- **Column-level RLS.** The `atelier_bookings_portal` view should restrict which columns a talent/crew session can see. Verify by checking which columns are returned in a direct Supabase REST call as a portal user.
- **Anonymise confirmation.** The `<DataRightsControls>` component requires typing `ANONYMISE` (exact, no partial match). After anonymise: talent/crew name is `Anonymised-XXXXXXXX`, all PII columns are null, `is_active = false`.

### 4.3 Operational resilience

- **Kill switch.** In Settings, confirm the Kill Switch section shows the current state (Green/Amber/Red) and the toggle. Do not flip. Just confirm it renders correctly and the state matches what's in the DB (`atelier_settings.kill_switch`).
- **Gmail failure banner.** If any `*_failed` email audit entries exist in the last 7 days, the Settings page should show a warning banner listing the failed action types. (Confirm by checking the audit log for any recent email failures.)
- **Push notification fallback.** If VAPID keys are not set, the "Enable Push Notifications" button should not appear (or should show "Not configured") — no JS error thrown.
- **Drive folder missing.** If a booking has no `drive_folder_link`, the "Drive ↗" button should be hidden, not show a broken link.

### 4.4 Observability and monitoring

- **Audit log completeness.** Every user-facing mutation should have a corresponding audit row. Spot-check:
  - Create booking → `booking_created`
  - Add fee line → `fee_line_added`
  - Send quote → `send_quote_email` (or `_failed`)
  - Mark talent paid → `mark_talent_paid`
  - Anonymise entity → `talent_anonymised` / `client_anonymised` / `crew_anonymised`
  - Archive booking → `booking_archived`
  - Delete booking → `booking_deleted`
- **Failed rows.** In `/audit`, all `*_failed` rows must be shown in red. Confirm this styling is applied.
- **Cron health.** Settings → Cron health table: all 8 crons show a last-run timestamp. Red = stale/never, amber = within 48h, green = today.

---

## Section 5 — Brand

### 5.1 Brand and professional impression

- **Agency name.** Nowhere in the UI should "Saunders & Co" or the agency email be hardcoded — all comes from `getAgencyConfig()` or env vars. Spot-check: Quote PDF header, email footer, Settings → Agency Profile.
- **Agency Profile in Settings.** All fields (name, email, ABN, address, website) are populated from env vars and displayed correctly. No placeholder text.
- **Logo/wordmark.** The sidebar logo/wordmark renders at 1x and 2x (retina). No blurry or missing logo.
- **Favicon.** Tab shows the correct favicon, not the Next.js default.
- **Print header.** Quote and Invoice PDF headers show agency name, ABN, and address — not a generic "Agency" placeholder.

### 5.2 Visual and UI consistency

- **PALETTE tokens only.** No hardcoded hex colours (`#XXXXXX`) in component JSX. Run `grep -rn "#[0-9a-fA-F]\{6\}" src/components` after the audit. Any hit outside of `PALETTE` definition is P2.
- **Section headings.** All `<h3>` section headings use the `.section-title` CSS class (uppercase, small, tracking-wide). No inline `font-size: 12px; font-weight: 600; text-transform: uppercase` found anywhere else.
- **Button styles.** Primary = filled accent; secondary = outlined; danger = red; all consistently sized across pages.
- **Form field labels.** All form fields have visible `<label>` elements — no placeholder-only fields (accessibility AND UX).
- **Spacing rhythm.** Consistent padding between sections. No content bleeding to screen edge on mobile.
- **Dark/light mode.** If the app supports dark mode, all pages should respect the system preference. If not, confirm the app is consistently light-only.

### 5.3 Copy and tone

- **Jasper's voice.** Automated emails (quote chase, brief clarify, gallery ping, tomorrow digest) use casual Australian English — first person, friendly, not corporate.
- **Australian spelling.** "organisation", "colour", "authorise", "licence" (noun) — not "organization", "color", "authorize", "license". Spot-check the Privacy page and any Settings copy.
- **No jargon leakage.** Raw DB column names (`snake_case`), enum values, or code identifiers must never appear in user-facing text. Run a visual scan of every page at normal zoom for any `snake_case` strings.
- **Consistent state labels.** "Brief received", "Brief parsed", "Quote sent", etc. — not "brief_received", "BRIEF_RECEIVED" or any other variant.
- **Truncation.** Long client names, booking refs, or talent names that overflow their container should be truncated with `…` not clipped mid-character.

### 5.4 Australianisation

- **Date format.** All dates shown to the user use `d MMM yyyy` (15 May 2026) or `d/M/yy` — never `MM/DD/YYYY`.
- **Currency.** Always `$X,XXX.XX` (dollar sign before, comma thousands separator, two decimal places). No `AUD` suffix unless explicitly required for legal docs.
- **Phone format.** Australian mobile numbers formatted as `0412 345 678`. No `+61` unless international context.
- **Timezone.** All timestamps shown to the user are in AEST/AEDT (Sydney time), computed dynamically via `Intl` — not hardcoded UTC+10.

### 5.5 Mobile and accessibility

At 390×844 (iPhone 14 Pro):
- Sidebar collapses to mobile bottom nav — confirm 4–5 primary links visible
- No horizontal scroll on any page (content wraps or truncates correctly)
- Booking detail tools row scrolls horizontally under a single row (not wrapped to two lines)
- QuoteBuilder usable (inputs reachable, totals visible)
- Touch targets ≥44px height (WCAG AA minimum)
- Modals/dialogs don't extend off-screen
- Font size ≥16px on form inputs (prevents iOS auto-zoom on focus)

Accessibility spot-check:
- All images have `alt` text (or `alt=""` for decorative images)
- All icon-only buttons have `aria-label` or a visually-hidden label
- Focus ring visible on keyboard navigation (not removed by `outline: none`)
- Color is not the only means of conveying information (hold expiry badge has text AND color)

---

## Section 6 — Technical

### 6.1 Performance and scaling

- **Dashboard load.** On a cold page load (disable cache), the dashboard should fully render in <3s on a desktop connection.
- **Calendar load.** `/bookings?view=calendar` with 50+ bookings in a month — bars render without janky layout shifts.
- **DB indexes.** Check Supabase advisors for any `seq scan` warnings on `atelier_bookings`, `atelier_booking_talent`, `atelier_fee_lines`, `atelier_audit_log`. Migration 0028 added 6 btree indexes — confirm they are present.
- **Supabase RPC functions.** `get_booking_state_counts` and `get_report_summary_agg` should be present in the DB (Supabase → Database → Functions). These replace JS-side aggregation for the dashboard.
- **`unstable_cache`.** Dashboard data fetches should be wrapped in `unstable_cache` (60s TTL). Verify by making a change and confirming the cached data busts within 60s after the mutation's `revalidateTag('bookings')`.
- **No N+1 queries.** On the booking calendar, contact details for all visible bookings should be fetched in a single batched `getBookingsRoster()` call, not one query per booking.

### 6.2 Code health (post-audit check)

Run these commands and report any issues:

```bash
# Type safety
npx tsc --noEmit

# Tests
npm test

# Dead code
grep -rn "TODO\|FIXME\|XXX" src/

# Hardcoded identity
grep -rn "Saunders" src/components src/app
grep -rn "jasperdouglasbailey\|jasper@" src/components src/app

# Hardcoded hex in components
grep -rn "#[0-9a-fA-F]\{6\}" src/components

# Hardcoded UTC offset
grep -rn "+10:00\|+11:00\|AEST\|AEDT" src/
```

Zero-tolerance: TypeScript errors, test failures.  
Report-but-don't-block: hardcoded strings, hex codes, inline tz offsets.

### 6.3 Documentation drift

Compare the live codebase against `CLAUDE.md` Build status entries:
- Every PR listed as "✅ Shipped" should be visible in the live UI
- Every "Deferred / blocked" item should genuinely not exist in the code yet
- No route in `src/app` that doesn't appear somewhere in `CLAUDE.md`
- No table in Supabase that isn't named in `CLAUDE.md` or a data layer file in `src/lib/data/`

### 6.4 Time edge cases

- **Hold expiry badge.** Leave a booking detail page open for 60s with a hold expiry visible. Confirm the badge re-evaluates (the 60s `setInterval` in `HoldExpiryBadge`). Inspect the badge colour thresholds: >7d green, 4–7d amber, ≤3d red, expired filled red.
- **Midnight boundary.** A booking with shoot dates spanning midnight (e.g. a late-night shoot) should not appear in the wrong day's calendar cell.
- **Timezone DST.** A booking shoot date of `2026-10-04` (Australian DST changeover Sunday) should display correctly regardless of the user's system timezone.
- **`quote_token_expires_at` calculation.** A token created today should expire 180 days from now (not 180 days from the booking created date, not from epoch).
- **Cron timing.** Crons are scheduled in UTC. `tomorrow-digest` at `20:00 UTC` = `06:00 AEDT`. Confirm the digest email refers to the correct "tomorrow" from AEST perspective.

---

## Execution order

1. Pre-flight (auth cookie, console errors enabled)
2. Section 1 smoke tests — screenshot every page
3. Section 1 link integrity + routing
4. Section 3 financial accuracy (fee engine canonical test)
5. Section 2 workflow A (Brief → Quote → Send → Confirm) — this is the core flow
6. Section 4 security headers + RLS check
7. Section 2 workflow B (Hold → Portal → Inbox notification)
8. Section 5 mobile pass (resize to 390×844, walk every page)
9. Section 1 edge cases + cron correctness
10. Section 3 email deliverability spot-check
11. Section 5 copy and tone sweep
12. Section 6 performance + code health

---

## Output format

Group findings by Section (1–6), then by severity within each section.

```
## Section 1 — Functional findings

P0 | /bookings/[id] | QuoteBuilder throws TypeError on empty fee list | QuoteBuilder.tsx:214
P1 | /inbox | ApprovalQueue filter tabs don't reset state on click | ApprovalQueue.tsx:88 — add key={filter}
P2 | /talent/[id] | Section heading uses inline text-xs font-semibold instead of .section-title | TalentDetail.tsx:112
```

Attach screenshots inline for any P0 or P1 finding.

End with:
1. **Punch list** — ranked by (severity × ease), each item a single actionable sentence
2. **Fix-PR grouping** — cluster fixes into 2–4 themed PRs (quick wins / data / UX / security)
3. **Forgotten items** — anything suggested in prior sessions but never implemented

---

## After the audit

1. Save the report as `docs/AUDIT-YYYY-MM-DD.md` (use today's date; use a suffix like B or C if there's already a file for that date).
2. Open a fix-PR for the highest-priority cluster.
3. Memory sync: re-read `CLAUDE.md` and update Build status, Deferred/blocked, Forward roadmap.
4. Check master `~/Documents/Claude/Projects/Beetle/CLAUDE.md` if any doctrine, integration, or scope changed.
