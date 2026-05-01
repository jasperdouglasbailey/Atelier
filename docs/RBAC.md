# Atelier RBAC & Privacy Model

> **Status:** doctrine locked, enforcement pending. The current pre-auth app
> shows everything to everyone. The rules below take effect when Supabase
> Auth lands and is wired into RLS policies + UI portals.

## Roles

| Role | Who | Surface |
|------|-----|---------|
| **owner** | Jasper (the agency principal) | Full admin dashboard at `/` |
| **staff** | Office staff at Saunders & Co | Same as owner today; permission tiers TBD |
| **artist** | A `talent` row's linked auth user | `/portal/artist` (TBD) — bookings they're attached to |
| **crew** | A `crew` row's linked auth user | `/portal/crew` (TBD) — bookings they're attached to |
| **client** | (no role — clients NEVER log in) | Receives quotes/invoices/links via email + unguessable URL only. Doctrine: no client portal. |
| **anon** | Anyone unauthenticated | `/login` only |

## Privacy doctrine (the rules)

The whole reason RBAC exists in Atelier is **money privacy**. The schema is
otherwise sharing-friendly — most fields *want* to be visible to whoever
needs them. The hard rule is: **a person on a booking sees their own
financial line items and nothing else's**.

### What each role sees on a booking they're attached to

Clients never log in. The "client" column below describes what is exposed
externally (via emailed quote PDF, invoice, or unguessable-URL public
viewer) — not an in-app surface.

| Field family | Owner | Artist | Crew | Client (external doc) |
|--------------|:-----:|:------:|:----:|:--:|
| Brief, schedule, location, deliverables, usage spec | ✓ | ✓ | ✓ | ✓ |
| Call sheet, gear/kit list, role assignments (names + roles) | ✓ | ✓ | ✓ | ✗ unless explicitly shared |
| Talent's own fee + commission | ✓ | own only | ✗ | ✗ |
| Crew's own day rate + OT | ✓ | ✗ | own only | ✗ |
| Other people's fees / day rates | ✓ | ✗ | ✗ | ✗ |
| Client invoice grand total | ✓ | ✗ | ✗ | ✓ |
| Per-line invoice breakdown (artist/agency/crew/expenses) | ✓ | ✗ | ✗ | ✗ |
| Internal agency notes (`agency_notes`) | ✓ | ✗ | ✗ | ✗ |
| Audit log | ✓ | ✗ | ✗ | ✗ |

### What each role sees on bookings they are NOT attached to

| Role | What they see |
|------|---------------|
| Owner / staff | Everything |
| Artist | Nothing (no row should be returned) |
| Crew | Nothing |
| Client | Nothing |

## Implementation plan

### Phase 1 — schema additions (when auth lands)

- New table `atelier_user_links` mapping `auth.users.id` → one of:
  `talent_id`, `crew_id`. A user has exactly one link. NOTE: no `client_id`
  link — clients don't have accounts.
- New enum `atelier_role`: `owner | staff | artist | crew`.
- Add `role` column to `atelier_user_links`.

### Phase 2 — RLS policies

Replace the placeholder policies (`USING (true) WITH CHECK (true)`) with
real ones. Pseudocode for the most critical:

```sql
-- A talent can only SELECT booking_talent rows that link to themselves.
CREATE POLICY booking_talent_self ON atelier_booking_talent
  FOR SELECT USING (
    talent_id = (
      SELECT talent_id FROM atelier_user_links
       WHERE user_id = auth.uid()
    )
  );

-- A talent can SELECT their own fee_lines, NOT crew lines or other artists'.
CREATE POLICY fee_line_self ON atelier_fee_lines
  FOR SELECT USING (
    -- Owner/staff see all
    EXISTS (SELECT 1 FROM atelier_user_links
            WHERE user_id = auth.uid() AND role IN ('owner', 'staff'))
    OR
    -- Artist sees their own fee lines
    (line_type IN ('artist_fee', 'usage_licence', 'file_management',
                   'retouching', 'post_production')
     AND artist_id = (SELECT talent_id FROM atelier_user_links
                       WHERE user_id = auth.uid()))
    OR
    -- Crew sees their own fee lines
    (line_type IN ('crew_labour', 'overtime', 'travel')
     AND crew_id = (SELECT crew_id FROM atelier_user_links
                     WHERE user_id = auth.uid()))
  );
```

(Note: `artist_id` and `crew_id` columns may need to be added to
`atelier_fee_lines` to enable per-line ownership filtering. Currently
fee lines link to a quote_version, not directly to a person.)

### Phase 3 — UI portals (artists + crew only — NEVER clients)

Two new route groups under `src/app/(portal)/`:

- `(portal)/artist/...`
- `(portal)/crew/...`

**No client portal — doctrine.** Clients receive quotes, invoices, and
deliverable links via email + unguessable URL (e.g. `/q/{tokenized-id}`
public quote viewer). They do not log in to Atelier.

Each portal renders a STRICT subset of the dashboard. The owner-facing
`(dashboard)` routes stay as-is. Same data layer functions can be reused
because RLS does the real filtering — the UI just hides what shouldn't
even be requested.

### Phase 4 — invitation flow

Owner invites a person from the talent/crew/client detail page. System
emails the invite (Gmail integration), recipient sets a password (via
Supabase Auth magic link), `atelier_user_links` row is created.

## Defence-in-depth

RLS is the floor, not the only check. Belt-and-braces:

1. **Server actions** check the caller's role before mutating.
2. **Page server components** redirect unauthorised users away (e.g. crew
   member trying to load `/bookings/{id}` admin view → redirect to
   `/portal/crew/bookings/{id}`).
3. **Client components** never receive privileged fields — server filters
   before render. Don't trust client-side hide-show with sensitive money.

## What is NOT yet decided

- **Multi-staff permissions**: today owner and staff are the same. Eventually
  staff might be capped (e.g. cannot delete bookings, cannot toggle the kill
  switch). Defer until there's a real second user.
- **Cross-booking artist visibility**: should an artist see their own past
  bookings even when not linked to the user account? (Yes, probably — but
  RLS needs a separate clause.)
- **Booking deletion**: hard-delete vs. soft-delete with retention. Default
  to soft-delete to keep audit trails complete.

## Why this matters

A photographer should never be able to see what a stylist is making on the
same shoot. A retoucher should never see what the client is paying. These
are the agency's most sensitive numbers — get this wrong once and trust
is gone. This file is the source of truth; if code disagrees with this
doc, the code is wrong.
