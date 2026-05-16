# CLAUDE.md — Atelier worktree

> **Canonical doctrine lives at:** `~/Documents/Claude/Projects/Beetle/CLAUDE.md`
>
> Read that first. It owns: tech stack, fee engine, agent topology, lethal
> trifecta, kill switch (Red/Amber/Green), privacy matrix, doctrine vs
> corpus split, signal library, key people. **Do not duplicate those rules
> here.** When the master changes, this file does not need to.
>
> **Sibling docs in this directory:**
> - `CHANGELOG.md` — what's been built, PR-by-PR (was sections 9-10 of an earlier CLAUDE.md)
> - `ROADMAP.md` — what's next (was "Forward roadmap" section)
>
> This file is doctrine and gotchas. The other two are history and plans.

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

**Cost vs billed split (PR #145):** Fee lines distinguish `subtotal` (billed) from `effectiveCost(line) = cost_subtotal ?? subtotal` (paid out). ASF + GST + super-charged compute on billed; commission + super-paid compute on cost. The spread is captured agency margin. Respect this whenever changing the engine.

**Other invariants:**
- ASF is toggleable per line — user can flip it off for genuine pass-through cost
- GST toggle is "Charge GST" (positive sense). Checked = applied
- Commissionable lines can NEVER be reimbursements (enforced server-side in `addFeeLineAction`/`updateFeeLineAction`)
- Super spread (15% − 12% = 3%) is agency margin, computed in `computeAgencyMargin`
- Net GST to ATO = collected from client − input credits paid to GST-registered talent/crew

## Development discipline rules

These are not aspirational. They are required. Every one has caused a real bug or CI failure.

**Select-type parity — the most common failure mode.**
Whenever you add a field to a Supabase `.select()` string, update the corresponding TypeScript return type in the same commit. The two must change together. The `BookingDetailRow.client` type and `getBooking()` select string diverging broke CI in PR #67.

**Schema change ripple — all four layers, always.**
Every DB schema change must propagate through all of: migration SQL → `database.generated.ts` → `database.ts` (hand types) → any `.select()` return types that name specific columns. After applying a migration, run `npm run db:types` to refresh `database.generated.ts`, then update `database.ts` to add the new column. The `database.compat.test.ts` file does an exhaustiveness check at tsc time — if a generated row has a column the hand type doesn't, tsc fails with `{ missing_in_hand: "column_name" }`. The error message names the missing column so the fix is mechanical.

**Agency config — never hardcode.**
Agency name, email, ABN, address, owner name always come from `getAgencyConfig()`. Never write "Saunders & Co" or any email address directly in JSX, copy, or emails. The pre-commit hook (PR#148) enforces this.

**Auto-commit and merge — always, without prompting.**
After implementing any task: verify types, commit with a clear message, open a PR, and merge it immediately. Do not ask the user to merge. Only pause for genuine task ambiguity, not process steps.

**CI must be green before calling done.**
Before declaring a task complete, check `mcp__github__pull_request_read(get_check_runs)` on the PR. If the `check` job failed, diagnose and fix before moving on. Never merge a failing PR without acknowledgment from the user.

**Ripple-effect audit on every change.**
After implementing, grep for every callsite that accesses any new field, type, or function. Verify each is typed correctly, no existing code breaks because of type shape changes, and no server action is missing the new field in its allowlist. The CI failure in PR #67 was exactly this class of error.

**Migration idempotency.**
All migrations use `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. A migration that fails on second run will break any automated deploy pipeline.

**`revalidateTag` completeness.**
Every server action that mutates booking data must call `revalidateTag('bookings', {})`. Check this whenever adding a new mutation path.

## Git hooks (active since PR#148)

Hooks live in `.githooks/` and are wired via `git config core.hooksPath .githooks` which `npm install` sets automatically through the `prepare` script.

- **pre-commit** — runs `scripts/guards/no-hardcoded-identity.sh`. Blocks commits that hardcode `"Saunders & Co"`, `"Jasper Bailey"`, or agency emails in `.ts/.tsx/.js/.jsx`. Allowlist: `agency-config.ts`, `*.test.*`, JSDoc/comment lines, env-var fallback lines (`process.env.X ?? "..."`), and lines tagged `// HARDCODED-OK: reason`.
- **pre-push** — runs `tsc --noEmit` then `vitest run`. Catches the "I think I'm done but CI disagrees" loop locally. Skipped on direct pushes to `main` / `master` (those go through PRs and CI).

`npm run preflight` runs the pre-push checks on demand. Bypass with `--no-verify` only when urgently shipping a fix and the failure is unrelated to your change.

## Standing checks before declaring "done"

1. `rm -rf .next && npx tsc --noEmit` (clean, zero errors — also enforced by pre-push hook)
2. `npm test` (185+ tests must stay green; add tests when changing pure functions — also enforced by pre-push hook)
3. `grep -rn "TODO\|FIXME\|XXX" src/` for anything new I left behind
4. Search for hardcoded user names / fake data — should be `getCurrentActor()` or env
5. If touching the fee engine, the AJE eComm #3579 canonical example must still pass
6. Check PR check runs — `check` job must be green before calling done
7. **Memory sync — non-negotiable.** Every PR that ships, before declaring done, re-read the relevant doc and update anything that's now wrong:
   - This file (worktree `CLAUDE.md`) — only if doctrine, hooks, code style, fee model, or worktree gotchas changed
   - `CHANGELOG.md` — every shipped PR gets an entry
   - `ROADMAP.md` — if scope changed (use strikethrough + dated note rather than rewriting history)
   - Master `~/Documents/Claude/Projects/Beetle/CLAUDE.md` — if doctrine, agent topology, integration list, signal library, or scope changed
   - `~/Documents/Claude/Projects/Beetle/ATELIER-HANDOFF.md` — if integration status or agents changed

   Drift is a real bug, not a minor footnote. This rule blocks "done" the same way tsc and tests do.

## Continuous improvement posture

After each phase closes, run a **full-app audit** before starting the next phase. Not a triage hardening pass — an actual end-to-end review:

- Every page: UI consistency, empty states, loading, error states, mobile layout, keyboard nav, accessibility
- Every form: validation, error messaging, labels, autocomplete, save-and-refresh, keyboard shortcuts
- Every workflow: brief → quote → send → confirm → shoot → invoice → pay; each transition; every reachable screen
- Every server action: input validation, audit logging, revalidation, error paths, race conditions
- Every integration: Gmail, Drive, Calendar, Anthropic, Supabase, Xero — failure modes, retries, idempotency, kill-switch coverage
- Every table: orphaned columns, missing indexes, RLS coverage matching application logic
- Every cron / background job: what runs when, what happens if it fails
- Every doctrine line in master CLAUDE.md: verify code actually enforces the rule

Output: ranked findings with file:line, prioritised into a polish PR sequence. Don't skip this in the rush to ship the next feature.

### Standard audit execution procedure

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

- This is a git worktree, not the main checkout. Changes here need pushing to the branch and merged via PR.
- Next.js generates `.next/types/validator.ts` from route folder names. If you delete a route folder, run `rm -rf .next` before `tsc --noEmit`.
- Supabase PostgREST builder lacks `.catch()` — use try/catch.
- Postgres daterange end is EXCLUSIVE. Use `src/lib/utils/daterange.ts`.

## When in doubt

If the master CLAUDE.md and this file disagree, the master wins. If the master is silent, ask Jasper — don't guess.
