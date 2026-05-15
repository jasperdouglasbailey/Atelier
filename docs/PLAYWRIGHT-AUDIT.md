# Playwright Audit Playbook

> **For Claude (CLI session with Playwright MCP):** This is the canonical
> smoke-test pass. Run it whenever Jasper asks you to "audit the platform"
> or after any significant deploy. Report findings as a ranked list with
> file:line where applicable; attach screenshots of anything that looks
> off (broken layout, console errors, empty 500 pages, contrast issues,
> overflowing tables, etc.).

## Pre-flight

1. **Base URL.** Default to `https://atelier.saundersandco.com.au`. If
   that's down, ask Jasper for the current Vercel preview URL.
2. **Authentication.** Jasper uses magic-link login. You can't log in
   on your own — ask him to start a session, hand you a fresh URL with
   a Supabase auth cookie, OR provide a `sb-access-token` cookie value
   you can set via `browser_set_cookie` before navigating.
3. **Viewport.** Run the full pass at 1440×900 (desktop) and 390×844
   (iPhone 14 Pro). Mobile is where layout bugs hide.
4. **Console errors.** Enable `browser_console_messages` and capture
   anything red or yellow. A clean page should produce zero errors.
5. **Network.** Watch for any 4xx / 5xx from `/api/*`, `/rest/v1/*`,
   `/auth/v1/*`. A 401 is fine on `/q/[token]` if expired; everywhere
   else, 4xx/5xx = bug.

## Per-page smoke tests

For each page below: navigate, screenshot, then run the **Look for**
checks. Stop and report if anything fails.

### Dashboard `/`

- Loads in <3s. KPI cards (4 of them) render numbers — none show "NaN",
  "Infinity", or "—" when there's data.
- "Needs attention now" list is sorted high→medium→low urgency.
- "This week" section shows upcoming shoots; hover on a booking row
  reveals the BookingHoverCard with talent + crew contact details and
  three copy buttons.
- "Top artists" horizontal scroll works on touch + mouse wheel.
- Sidebar inbox badge matches the count on `/inbox`.

### Inbox `/inbox`

- Pending approvals list renders. Click an item — does the right-pane
  preview update? Approve / Decline buttons present.
- Filter tabs (all / hold / email / parsed-brief) reset the queue state
  when clicked (`key={filter}` on `<ApprovalQueue>` was added in audit B).
- "Potential Briefs" panel: emails from Vercel/GitHub/Slack should NOT
  appear (domain blocklist). Emails from known clients should.

### Bookings `/bookings`

- **Calendar view** (`?view=calendar`): default for new visitors.
  Bars use solid colours with auto-contrasted text. Hover → BookingHoverCard.
  Verify no bar renders as "BOOK..." or "B." stub (the wrapper-width
  regression).
- **List view** (`?view=list`): title format is `BOOK-0042 - Oliver Begg - AJE, Resort 26`.
- **Board view** (`?view=board`): drag-drop works between columns
  (don't actually drop — just verify the drag preview appears).
- **Archived tab**: shows archived bookings, sorted by archived_at desc.

### Booking detail `/bookings/[id]`

Pick the most recent confirmed booking. Tabs: Overview / Team / Documents / Comms / Activity.

- **Tools row** (top of page): Edit / Workspace / Print & PDFs ▾ /
  Client view / Use as template / Quick compose / Archive / Delete.
  Click "Print & PDFs ▾" — dropdown opens.
- **Overview tab**: StageChecklist shows green/amber/grey, "optional"
  items are grey not amber. Brief panel + Usage merged into one.
  PrecedentSignals + JobPnLPanel render.
- **Team tab**: BookingTeam shows talent + crew rows. HoldExpiryBadge
  (when applicable) colour by threshold (green >7d, amber 4–7d, red ≤3d).
  "Substitute" amber button on each talent row.
  Tasks panel shows open tasks. SchedulesPanel renders per-day rows.
- **Documents tab**: Drive folder link works.
- **Comms tab**: QuickCompose panel collapsed by default.
- **Activity tab**: audit log entries render.

### Talent / Crew / Clients `/talent` `/crew` `/clients`

- Lists are filtered to `is_active = true`. Anonymised rows do NOT
  appear (regression risk from PR#42).
- City groupings collapsible (Crew, Talent). Sydney first, then
  Melbourne, then by frequency.
- Click into a detail page — 3-row header (identity / badges / actions).
- **Edit form**: change a field, wait 1.5s. `✓ Saved` appears next to
  the Save button. Reload — change persisted. (Auto-save from PR#100.)
- DeleteEntityButton + DataRightsControls (Export / Anonymise) present
  on detail pages. Anonymise requires typing `ANONYMISE`.

### Grid planner `/grid-planner`

- Add a caption to a slot, refresh page — caption persists (localStorage).
  Image itself won't persist (blob URL) — that's expected.
- "Saved locally" notice + Clear button at top of page.
- Upload an image → Instagram URL field accepts paste → stats render
  (or "Stats unavailable" if Instagram fetch fails — not silent).

### Reports `/reports` + Costs `/costs`

- KPI cards render. 12-month revenue bars show data (or empty-state
  message if no confirmed bookings).
- "Top clients" + "Top artists" tables render.

### Compliance `/settings/compliance` + Renewals `/settings/business-renewals`

- Lists of talent/crew with documents expiring within 90 days.
  Red ≤30d, amber ≤90d, green >90d, muted = not provided.
- Renewals page: Add / Edit / Delete inline.

### Audit `/audit`

- Last 100 entries. Failed actions (`*_failed`) shown in red.

### Settings `/settings`

- Kill switch toggle works (don't actually flip Red).
- Agency Profile fields populated from env vars.
- Integrations section: Google scope badges (5 of them — Inbox search,
  Drafts, Send, Drive, Calendar) show ✓/✗ accurately.
- "Push Notifications" section: Enable button present (unless browser
  already has permission).
- Cron health table: last-run timestamp + green/amber/red badge per cron.
- Gmail failure banner only shows if recent `*_failed` audit rows exist.

### Public quote `/q/[token]`

- Use a token from a `quote_sent` booking. Page loads without auth.
- "Valid until DD Month YYYY" footer renders.
- Accept / Decline buttons work; after accept, page refreshes to
  confirmed state.

### Portals `/portal/talent` `/portal/crew`

- Sign in as a talent or crew user (Jasper needs to provide creds —
  test account: ask).
- Profile section shows own data. No agency_notes, client_id, financial
  totals visible (column-level RLS from PR#31).
- Bookings list: own bookings only. Hold response buttons (Accept /
  Decline) on `holds_pending` state. Day rate confirmation form on
  `artists_crew_held → shoot_live`.
- Self-reported unavailability date range (crew portal).
- Digital call sheet visible for upcoming shoots.

## Critical workflows (end-to-end)

After per-page smoke pass, run these full flows. Use disposable test
data (booking ref like `BOOK-TEST-` or a real one Jasper flags as
expendable).

### Workflow 1 — Brief → Quote → Send → Confirm

1. From `/inbox`, click a Potential Brief → "Convert to booking"
2. Booking lands in `brief_received` state
3. Click "Parse brief" → `brief_parsed`
4. Add talent + crew in BookingTeam
5. Open QuoteBuilder, add fee lines:
   - `artist_fee` $5000 (commissionable, ASF on)
   - `crew_labour` $1000 (super-bearing, ASF on)
   - `equipment_rental` $500 (ASF on, GST always on)
6. Verify totals panel:
   - Subtotal = $6,500
   - ASF (15%) on all three lines
   - Commission only on artist_fee
   - Super (3% spread) on crew_labour day rate only
   - GST 10% on the registered lines
7. Click "Send quote" → pre-flight modal shows green checks
8. Send → booking moves to `quote_sent`, audit row written
9. Open `/q/[token]` in incognito → click Accept → state `quote_confirmed`

**Watch for:** any mismatch between QuoteBuilder preview and stored
totals; any state transition without an audit row; ASF being applied
to GST line (it shouldn't be).

### Workflow 2 — Hold response → notification

1. With a confirmed booking, propose hold for a crew member
2. Open `/portal/crew` as that crew member, accept the hold
3. Verify approval appears in `/inbox` with `hold_response_notify`
   action_type
4. Verify push notification fires (if browser permission granted)
5. Verify Sidebar inbox badge increments without a page refresh

### Workflow 3 — Auto-save on entity forms

1. Open any client / talent / crew edit form
2. Edit a single field, wait 2s
3. Watch for `Saving…` → `✓ Saved` indicator
4. Refresh — change persisted

### Workflow 4 — Mobile

1. Resize viewport to 390×844
2. Pull-to-refresh works on any dashboard page
3. Sidebar collapses; mobile bottom nav present
4. Booking detail tools row scrolls horizontally (not wrapped)
5. QuoteBuilder remains editable

## Output format

For each finding:

```
[SEVERITY] [PAGE/URL] [DESCRIPTION] [FIX HINT]
P0 / page-name / what's broken / file.tsx:line if known
```

- **P0** — broken, data loss, can't proceed
- **P1** — wrong-but-not-broken, visible to user
- **P2** — polish, cosmetic

Attach screenshots inline. Group by page. End with a punch list of
suggested fix-PRs in order of (severity × ease).

## After the audit

1. Save the report as `docs/AUDIT-YYYY-MM-DD.md` (use today's date).
2. Open a fix-PR for the highest-priority cluster.
3. Memory sync at the end — update `CLAUDE.md` Build status.
