# Fee-line simplification proposal — 2026-05-17

> **Status: ANALYSIS ONLY. No code changes yet. Awaiting Jasper review before any migration runs.**
>
> Financial-doctrine refactor — requires explicit sign-off because the math touches commission, ASF, super, GST, and reimbursement routing. Wrong-by-1% on any line type changes what gets billed and paid.

## What Jasper asked

Three threads:

1. **Reimbursement vs crew-link**: replace the `is_artist_reimbursement: boolean` flag and the parallel `crew_id` / `talent_id` "linked to a person" concept with **one** "linked to person" picker on every non-commissionable line. The link itself means "we owe this person this amount" (= reimbursement). No link = "we pay the vendor directly."
2. **Line type collapse**: drop ~7 of the expense subtypes (Studio Hire, Catering, Wardrobe, Props, Location Fee, Permits, Insurance). They all have identical fee-engine treatment, so they're just labels.
3. **Retouching vs Post-Production**: are they different enough to keep separate? (If no, merge.)

Plus an explicit constraint: **crew overtime + crew travel must stay distinct from crew labour** — super applies only to crew labour, not OT or travel.

---

## Current fee engine — full truth table

Pulled from `CLAUDE.md` (canonical doctrine) + verified against `lineTypeDefaults()` in `src/app/actions/quotes.ts` and `defaultChargeGst()` / `ASF_OFF_BY_DEFAULT` / `ALWAYS_GST_LINE_TYPES` in `QuoteBuilder.tsx`.

| Line type | Commission 20% | ASF 15% default | GST default | Super (15% charged / 12% paid) |
|---|---|---|---|---|
| `artist_fee` | ✅ Yes | ✅ On | Follows artist's `gst_registered` | ❌ No |
| `usage_licence` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `file_management` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `retouching` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `post_production` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `artist_overtime` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `artist_travel` | ✅ Yes | ✅ On | Follows artist GST | ❌ No |
| `crew_labour` (day rate) | ❌ No | ✅ On | Follows crew GST (ON if no crew) | ✅ **Yes — only on day rate** |
| `overtime` (crew OT) | ❌ No | ✅ On | Follows crew GST (ON if no crew) | ❌ **No — OT is NOT super-bearing** |
| `equipment_rental` | ❌ No | ✅ On | ✅ **Always ON** (supplier invoice has GST) | ❌ No |
| `crew_equipment` | ❌ No | ✅ On | ✅ Always ON | ❌ No |
| `studio_hire` | ❌ No | ✅ On | ✅ Always ON | ❌ No |
| `travel` (crew/prod) | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `catering` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `wardrobe` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `props` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `casting` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `location_fee` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `permits` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `insurance` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |
| `other_expense` | ❌ No | ✅ On | Follows crew GST if linked (ON default) | ❌ No |

**Important invariants**:
- ASF is toggleable per-line; this is the DEFAULT.
- GST toggle is "Charge GST" (positive sense). Checked = applied.
- Commissionable lines can NEVER be reimbursements (enforced server-side in `addFeeLineAction` / `updateFeeLineAction`, and in the UI by hiding the checkbox).
- Super spread (15% − 12% = 3%) is agency margin, computed in `computeAgencyMargin`.
- Net GST to ATO = collected from client − input credits paid to GST-registered talent/crew.

---

## How many distinct fee-engine rows are there really?

Group the 22 line types by IDENTICAL fee treatment:

### Group A — Commissionable artist labour (7 types, 1 treatment)
`artist_fee`, `usage_licence`, `file_management`, `retouching`, `post_production`, `artist_overtime`, `artist_travel`
- Commission ✅ | ASF ✅ on | GST follows artist | Super ❌

### Group B — Crew labour (super-bearing) (1 type, 1 treatment)
`crew_labour`
- Commission ❌ | ASF ✅ on | GST follows crew (default ON) | **Super ✅**

### Group C — Crew overtime + travel (non-super, follows crew GST) (2 types, 1 treatment)
`overtime`, `travel`
- Commission ❌ | ASF ✅ on | GST follows crew | Super ❌

### Group D — Always-GST rentals (3 types, 1 treatment)
`equipment_rental`, `crew_equipment`, `studio_hire`
- Commission ❌ | ASF ✅ on | GST **always ON** (supplier has GST) | Super ❌

### Group E — Production expenses (8 types, 1 treatment)
`catering`, `wardrobe`, `props`, `casting`, `location_fee`, `permits`, `insurance`, `other_expense`
- Commission ❌ | ASF ✅ on | GST follows crew if linked (ON default) | Super ❌

**Net: 22 line types collapse to 5 fee-engine groups.** That's the core observation.

---

## Jasper's proposal — restated cleanly

### Proposal 1: Collapse Group E (8 types → 1)

All 8 expense types have identical fee treatment. They're labels for grouping on the quote / invoice. Replace with a single `expense` type + free-text description.

**Pros**:
- Half as much enum surface area
- Faster to add a line — pick "Expense", type "Catering: Spit Roast Co"
- Removes the "is this a wardrobe or a prop?" categorisation friction

**Cons / what's lost**:
- Grouped subtotals on the quote PDF — currently the quote PDF can group "Production Expenses: catering $X + wardrobe $Y + props $Z" with a subtotal. If we merge to one `expense` type with descriptions, the grouping becomes substring matching on description (fragile).
- Reporting / cost analytics — "% of revenue going to catering" becomes a SQL `WHERE description ILIKE '%catering%'` which will miss "Spit Roast Co" lines that don't say "catering" in the description.

**Mitigation**: keep a `category` text field (free-form or enum-soft) on the expense line that's purely for grouping. Quote PDF groups by category, defaulting to "Production Expense" if blank. Loses zero information, drops 7 line types.

**Recommendation**: ✅ **Yes, collapse**. The 8 types are pure labels; the `category` mitigation preserves grouping with less rigidity.

### Proposal 2: Collapse Group D (3 types → 1)

`equipment_rental`, `crew_equipment`, `studio_hire` — identical treatment, always-GST rentals.

**Pros**: same as Group E.

**Cons**: same as Group E + studio_hire is often visually distinct on a quote (clients want to see "Sun Studios: $X" not buried under "Equipment").

**Recommendation**: ✅ **Yes, collapse** to one `rental` type with a `category` field. Same mitigation pattern.

### Proposal 3: Group A — collapse the 7 artist line types?

`artist_fee`, `usage_licence`, `file_management`, `retouching`, `post_production`, `artist_overtime`, `artist_travel` — all identical in fee engine. But they're semantically very different to a client reading a quote.

**Why I'd KEEP them separate**:
- The client SEES these on the quote. "Artist Fee: $5,000 / Usage Licence: $3,000" is a fundamentally different conversation from "Artist services: $8,000". The client may want to argue down one but not the other.
- Usage licence has implications for re-shoots, contract renewals, BUR replacement work in the roadmap.
- Artist overtime is a different conversation from artist day rate — clients want OT itemised for post-shoot transparency.
- Artist travel needs visibility for client travel-budget discussions.

**Why I might MERGE some**:
- `retouching` vs `post_production`: see Proposal 5 below.
- `file_management`: often bundled INTO retouching/post in practice. But splitting it out preserves the option to bill it as a separate line for clients who want fine-grained breakdown.

**Recommendation**: ⚠️ **Keep separate**. These are client-facing categories, not internal book-keeping. The cost of keeping them is one enum row; the benefit is quote clarity.

### Proposal 4: Replace `is_artist_reimbursement` + dual `crew_id` / `talent_id` with one "linked to person" picker

Current model:
- `is_artist_reimbursement: boolean` — flag meaning "we on-charge this to the client at cost+ASF+GST, pay the artist back at cost"
- `crew_id: string | null` — link to a crew member (used for crew bills, payroll, fee_lines filtered by crew_id)
- `talent_id: string | null` — same but for talent

Proposed model:
- ONE `person_id` picker on every non-commissionable line (or two pickers — one crew, one talent — that are mutually exclusive)
- Link is set → "we owe this person this amount" (= reimbursement semantics)
- Link is null → "we paid the vendor directly"
- `is_artist_reimbursement` is **derived**, not stored: `linked_to_artist AND not commissionable`

**This works.** Walking each scenario:

| Scenario | Current | Proposed |
|---|---|---|
| Artist's day rate (commissionable, paid to artist) | `talent_id=X`, `is_artist_reimbursement=false`, `artist_fee` | `talent_id=X`, `artist_fee` — UI just doesn't show reimbursement concept on commissionable lines |
| Artist on-charges taxi receipt | `talent_id=X`, `is_artist_reimbursement=true`, `other_expense`, `cost_subtotal` set | `talent_id=X`, `expense` — link implies reimbursement |
| Studio hire, we pay studio directly | `crew_id=null`, `talent_id=null`, `studio_hire` | `crew_id=null`, `rental`, category=studio |
| Crew member's day rate | `crew_id=X`, `crew_labour` | `crew_id=X`, `crew_labour` — same |
| Crew OT (linked) | `crew_id=X`, `overtime` | `crew_id=X`, `crew_overtime` |
| Crew member rents kit + on-charges | `crew_id=X`, `crew_equipment`, `cost_subtotal` set | `crew_id=X`, `rental` — link implies reimbursement |

**Open question — split routing edge case**:
- "Studio rented by Sarah on her card, but we'll pay her back at the end."
  - Current: `crew_id=Sarah`, `studio_hire`, set `is_reimbursement` flag → we owe Sarah
  - Proposed: `crew_id=Sarah`, `rental` → link itself means we owe Sarah ✓
- "Studio rented by Sarah on her card, but the studio invoices us directly so we won't reimburse Sarah."
  - Current: `crew_id=Sarah`, `studio_hire`, no `is_reimbursement` flag — but this is ambiguous in current model too
  - Proposed: `crew_id=null`, `rental`, description "Studio (booked by Sarah)" — cleaner

The proposed model **forces clarity**: if you mark Sarah as linked, you've committed to paying her. There's no "associated but not paying" half-state. **This is an improvement, not a loss.**

**Recommendation**: ✅ **Yes, simplify**. Drop `is_artist_reimbursement` column entirely. "Linked to person on non-commissionable line" = reimbursement.

**Cost note**: the `cost_subtotal` column (project_cost_vs_billed_split.md) still matters and stays. The semantic is "what we ACTUALLY paid the linked person vs what we billed the client" — this is a separate dimension from whether-it's-reimbursed. Even a non-reimbursed line CAN have a cost_subtotal if we're capturing margin on it (e.g. we charge $1500 for studio, paid $1200 to the studio, $300 spread captured).

### Proposal 5: Merge `retouching` and `post_production`?

Same fee treatment. Different meaning:
- **Retouching** = colour, dust, blemish removal on STILLS
- **Post-production** = grade + edit + sound for VIDEO

For Atelier specifically: most quotes have either retouching (stills work) or post (video work), rarely both. The disambiguation by description ("Retouching - 12 stills" vs "Post - 30 sec edit") is sufficient.

**Recommendation**: ✅ **Yes, merge** into one `post_production` line with the description carrying the specifics. Saves one enum row.

---

## What this simplification looks like — proposed end state

**8 line types instead of 22**:

| Proposed type | Replaces | Fee treatment |
|---|---|---|
| `artist_fee` | (same) | Commission ✅, ASF ✅, GST follows artist, Super ❌ |
| `usage_licence` | (same) | Commission ✅, ASF ✅, GST follows artist, Super ❌ |
| `post_production` | post_production + retouching + file_management | Commission ✅, ASF ✅, GST follows artist, Super ❌ |
| `artist_overtime` | (same) | Commission ✅, ASF ✅, GST follows artist, Super ❌ |
| `artist_travel` | (same) | Commission ✅, ASF ✅, GST follows artist, Super ❌ |
| `crew_labour` | (same) | Commission ❌, ASF ✅, GST follows crew, Super ✅ |
| `crew_overtime` | overtime (rename for clarity) | Commission ❌, ASF ✅, GST follows crew, Super ❌ |
| `crew_travel` | travel (rename) | Commission ❌, ASF ✅, GST follows crew, Super ❌ |
| `rental` | equipment_rental + crew_equipment + studio_hire | Commission ❌, ASF ✅, GST always ON, Super ❌ |
| `expense` | catering + wardrobe + props + casting + location_fee + permits + insurance + other_expense | Commission ❌, ASF ✅, GST follows crew if linked, Super ❌ |

That's 10 (not 8 — corrected). Each represents a distinct fee-engine treatment. The 12 cut types collapse cleanly into them.

Optional consolidation: `file_management` merged into `post_production` (same treatment, often bundled in practice). Saves one type.

**Schema-level changes**:
1. `fee_line_type` enum: drop 12 values, optionally rename `overtime` → `crew_overtime` and `travel` → `crew_travel` for clarity.
2. New `category` text column on `atelier_fee_lines` for the grouping label (defaults to the old enum value during migration).
3. Drop `is_artist_reimbursement` column (or alias it to `talent_id IS NOT NULL AND line_type NOT IN (...)`).
4. `cost_subtotal` stays exactly as is.

---

## Ramifications — financial doctrine impact, by component

### 1. Quote totals
**No change.** Each old line type maps to a new one with identical fee-engine treatment. Migration is `UPDATE atelier_fee_lines SET line_type = 'expense', category = 'catering' WHERE line_type = 'catering'` and equivalents. The quote total computation reads the new type → same group → same math.

**Risk**: the AJE eComm #3579 canonical test. If any line in that test uses one of the dropped types, the migration must map it to the right replacement OR the test rebuilds. **Action item**: run the canonical test under the new mapping to confirm byte-identical output before shipping.

### 2. Commission
**No change.** The set of commissionable types is unchanged — `artist_fee`, `usage_licence`, `post_production`, `file_management`, `artist_overtime`, `artist_travel` (Group A). Renaming or merging doesn't shift any line into or out of this set.

### 3. ASF
**No change.** Every line type defaults to ASF on; user can toggle off per-line. Merging types doesn't change the default.

### 4. GST
**One subtle change.** Group D (`rental`) is always-GST regardless of payee. If we merge studio_hire → rental, that stays always-GST ✓. Group E (`expense`) follows crew GST if linked. Merging catering → expense, the catering line that previously defaulted GST-ON keeps that default ✓.

**Action item**: audit any existing rows where `line_type = 'catering'` (etc.) and `charge_gst = false`. Those non-default rows must keep their `charge_gst = false` value across migration — the SET statement updates `line_type` and `category` only, never `charge_gst`.

### 5. Super
**Critical — must NOT break.** Super applies only to `crew_labour`. NOT to OT, NOT to travel. The current schema gets this right; the proposal keeps `crew_labour` distinct from `crew_overtime` and `crew_travel`. ✓

**Risk**: if anyone accidentally renames `crew_labour` to `crew_anything` in a migration, super computation breaks silently. **Action item**: explicit test asserting only `crew_labour` triggers super in computeCrewPayment.

### 6. Reimbursement semantics
**Real change here.** Removing `is_artist_reimbursement` and deriving from `talent_id IS NOT NULL AND line_type NOT IN (commissionable_types)`. Two risks:

- **Migration data integrity**: any current row with `is_artist_reimbursement = true` MUST have `talent_id != null`. If there are rows with `is_artist_reimbursement = true` and `talent_id = null`, those are corrupt and need backfill (link to a specific talent or strip the flag).
- **Action item**: SQL query before migration: `SELECT COUNT(*) FROM atelier_fee_lines WHERE is_artist_reimbursement = true AND talent_id IS NULL`. If zero, safe. If >0, decide per-row.

### 7. Crew bills + Artist bills
**No change in math.** Bills filter fee_lines by `crew_id` / `talent_id` and apply commission/super/GST per line type. The new types map cleanly to the same treatment.

**Risk**: hardcoded line_type lists in `JobPnLPanel.tsx`, `crew/[crewId]/page.tsx`, `artist/[talentId]/page.tsx`, `person-billing.ts`. **Action item**: every Set<FeeLineType> in the codebase must be updated to use the new enum values. Compile-time check via tsc catches most; runtime check is the AJE canonical test.

### 8. Quote PDF / Invoice PDF / Confirmation PDF
**Grouping label changes.** Current grouping by category ("Photography & Artist Fees", "Crew & Labour", "Production Expenses") still works — just read the new `category` column instead of the line_type itself.

### 9. Payroll / Remittance emails
**No change.** `markCrewPaidAction` and `markTalentPaidAction` sum fee_lines by person, apply commission for talent + super for crew_labour. Same math, just different type labels feeding the same buckets.

### 10. Audit log + corpus archive
**No change for new rows**. Existing audit log entries reference old line_type values as text in their `new_value` JSON. Old values stay readable; nothing to migrate.

---

## Migration plan — IF approved

**Phase 1 (no-ops, safe)**:
1. Add `category` text column to `atelier_fee_lines` with default null.
2. UPDATE: backfill category from line_type for all rows. Catering line → `category = 'catering'`. Studio_hire → `category = 'studio'`. etc.
3. Ship code that reads/writes `category` alongside `line_type`. No removal yet.

**Phase 2 (low-risk)**:
4. Update QuoteBuilder + AddLineForm to use the new 10-type enum in the dropdown. Internally, server actions still accept old enum values for backward compat.
5. Run AJE canonical test under both old and new types — must be byte-identical.

**Phase 3 (the cut)**:
6. Migration: `UPDATE atelier_fee_lines SET line_type = 'expense' WHERE line_type IN ('catering','wardrobe','props','casting','location_fee','permits','insurance','other_expense')`. Plus `rental` consolidation. Plus `post_production` merge.
7. Update the `fee_line_type` enum: add new values, then DROP the old ones (Postgres enum value drop requires the recreation pattern — careful here).
8. Drop `is_artist_reimbursement` column. Compile-time refactor: derive from `talent_id` + non-commissionable check.

**Phase 4 (cleanup)**:
9. Audit every hardcoded Set<FeeLineType> in the codebase.
10. Regen types. Update CLAUDE.md doctrine table. Regen ROADMAP.

**Verification at every phase**:
- AJE eComm #3579 test byte-identical
- 212+ existing tests green
- Specific tests: super-only-on-crew-labour, reimbursement-derived-from-link, GST-default-per-type

---

## My confidence per change

| Change | Confidence | Why |
|---|---:|---|
| Collapse Group E (8 → 1 `expense`) | **95%** | Pure labels, identical treatment. Risk = enum migration mechanics only. |
| Collapse Group D (3 → 1 `rental`) | **95%** | Same as above. |
| Drop `is_artist_reimbursement` flag, derive from link | **90%** | Sound semantics. Risk = corrupt rows where flag was set but no talent_id. Pre-flight SQL check is required. |
| Merge `retouching` + `post_production` + `file_management` | **85%** | Identical fee treatment; risk is client communication ("we used to itemise retouching separately"). Reversible via `category`. |
| Keep all 7 Group A types separate | **95%** | Client-facing. Cost of keeping = 6 enum rows. Worth it. |
| Rename `overtime`/`travel` → `crew_overtime`/`crew_travel` | **80%** | Clarity win, but every code reference must update. tsc helps but verbose. |

**Lowest-confidence item**: the data-integrity check on `is_artist_reimbursement = true AND talent_id IS NULL`. That's a SQL query Jasper or I should run before deciding.

---

## Open questions for Jasper

1. **AJE canonical test**: does it use any of the dropped types? Quick grep should tell us.
2. **`file_management`**: kept separate from `post_production` for any business reason, or just historical? (My read: merge.)
3. **`crew_overtime` vs `overtime` rename**: better naming, but every Set<FeeLineType> in the code needs touching. Worth it for clarity, or just leave the old names?
4. **`expense` category enum**: open-list (free text) or closed enum (catering / wardrobe / etc.)? Open is more flexible; closed enables analytics grouping.
5. **Migration timing**: I'd recommend Phase 1 + 2 in one PR (additive, zero risk), Phase 3 in a separate PR after a week of soak.

---

## Recommendation summary

**Yes, simplify. Here's the order:**

1. **PR D1 (additive, soak)**: add `category` column, backfill, ship code that reads it. No removals. Risk: nil.
2. **PR D2 (cut Group E + D)**: 12 expense/rental types → 2 (`expense`, `rental`). Pre-flight: SQL check for the reimbursement-flag-without-talent-link corruption. Risk: low if pre-flight passes.
3. **PR D3 (reimbursement derived from link)**: drop `is_artist_reimbursement` column, derive from `talent_id IS NOT NULL` on non-commissionable lines. Risk: low after PR D2.
4. **PR D4 (post-prod merge)**: merge `retouching` + `file_management` into `post_production`. Optional. Risk: nil.

Total estimated effort: ~3h of code + 1h of careful verification. Each PR is mergeable independently and adds value without forcing the next one.

**Critical pre-flight before ANY of this ships**: SQL query to confirm no `is_artist_reimbursement = true AND talent_id IS NULL` rows exist in prod. If they exist, backfill first.

---

## Pre-flight SQL results (run against prod 2026-05-17)

Three queries against prod via Supabase MCP. **All three meaningfully reduce the perceived risk of this refactor.**

### Query 1: orphan reimbursements

```sql
SELECT COUNT(*) FROM atelier_fee_lines
WHERE is_artist_reimbursement = true AND talent_id IS NULL;
```

**Result: 2 rows.** Both equipment rentals on BOOK-0006 (Peter Alexander Campaign, $3,600) and BOOK-0002 (Venroy Resort Drop SS26, $500). Both bookings have **Oliver Begg as the only attached talent**.

**Decision for Jasper**: each of these 2 rows is one of:

(a) **The reimbursement flag was set in error** (we paid the vendor directly, not Oliver). Action: `UPDATE atelier_fee_lines SET is_artist_reimbursement = false WHERE id IN (…)`.

(b) **Oliver paid for the equipment on his own card and we owe him**. Action: `UPDATE atelier_fee_lines SET talent_id = '<Oliver's id>' WHERE id IN (…)`.

You'd know which from the receipts / messages around those bookings. Without that decision the simplification can't proceed cleanly.

### Query 2: line_type frequency in prod

| line_type | row count | total AUD |
|---|---:|---:|
| crew_labour | 15 | $10,450 |
| artist_fee | 7 | $25,500 |
| overtime | 4 | $480 |
| crew_equipment | 4 | $1,800 |
| usage_licence | 4 | $4,700 |
| equipment_rental | 4 | $5,200 |
| post_production | 1 | $0 |
| file_management | 1 | $500 |
| artist_overtime | 1 | $600 |

**Total: 41 fee_line rows in prod, across 9 distinct types.** The other 13 line types (catering, wardrobe, props, casting, location_fee, permits, insurance, other_expense, studio_hire, retouching, travel, artist_travel) are **all unused**. Cutting them is free — no row migration needed.

Real migration scope:
- **9 types reduced to 6** (artist_fee, usage_licence, post_production, artist_overtime, crew_labour, plus consolidated `rental` for crew_equipment + equipment_rental, plus `crew_overtime` rename of overtime).
- 8 rows to remap (4× crew_equipment + 4× equipment_rental → rental).
- 4 rows to rename (overtime → crew_overtime).
- 1 row of file_management to migrate to post_production (if we go ahead with that merge).
- **Total: ~13 rows touched. Negligible.**

### Query 3: canonical fee-engine test coverage

```bash
grep -A 1 "line_type:" src/lib/utils/fee-engine.test.ts | grep -oE "'[a-z_]+'"
```

The canonical AJE eComm #3579 test uses only `travel` and `usage_licence`. `travel` is being kept (as `crew_travel` if we rename, otherwise unchanged). `usage_licence` is unchanged. **Canonical test is safe under the proposed migration.**

### Net takeaway

The refactor is **much smaller than the doc earlier implied**. With ~13 prod rows touched and the canonical test safe, this becomes a low-risk multi-PR sequence as long as the 2 orphan reimbursements are decided FIRST.

---

## Auto-refresh — separately fixed in this commit

`src/components/layout/PullToRefresh.tsx` was calling `router.refresh()` every 5 minutes via `setInterval`. Killed the interval; kept the pull-to-refresh gesture. Mid-form work no longer gets interrupted. Single commit, no migration.

---

## State of brief intake / structured usage work (just shipped today)

PRs #168 / #169 / #170 are all merged. Don't forget to come back to:
- Set `ANTHROPIC_API_KEY` in Vercel production env (blocks LLM extraction in prod)
- Send more real briefs for the fixture corpus
- Build the BUR replacement deterministic valuation (ROADMAP item 8) — needs Jasper's rate data per category
- Build the next-tier brief intake extension fields (ROADMAP item 7) — brand/agency, candidate-dates, ranges, etc.
