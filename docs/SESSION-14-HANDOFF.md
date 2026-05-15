# Session 14 handoff — paste this into a new session

> **For Jasper:** `cat docs/SESSION-14-HANDOFF.md` to copy, paste at the start of a new chat. Or just point the new session at this file path.
>
> **For the next assistant:** read this top-to-bottom before doing anything. It catches you up on what shipped, what's been decided, and what's still on Jasper's plate.

## What's true on `main` right now (as of 2026-05-15, end of session 14)

Fourteen PRs landed this session:

| PR | What it shipped |
|---|---|
| #114 | Kill-switch UX (`useOptimistic`) + Realtime banner + audit deep-link + migration 0050 |
| #115 | Redesign PR-1 — shared `DenseListTable` across Talent / Crew / Clients / Locations / Audit |
| #116 | Redesign PR-2 — shared `KpiCard` + `SectionCard` across Dashboard / Reports / Compliance / Renewals / Costs |
| #117 | Redesign PR-3 — Settings + Inbox dense layouts |
| #118 | Dismiss-brief persistence + Convert-to-booking undo + migration 0051 (established the undo doctrine) |
| #119 | Undo trio (reject-approval + delete-fee-line + delete-schedule-row) + ApprovalQueue density + Locations CTA |
| #120 | Hotfix: `dismissed_by` uuid → text (migration 0052) |
| #121 | Dashboard redesign v1 |
| #122 | Dashboard layout v2 — 3-col / 4-row grid matching Jasper's sketch |
| #123 | Dashboard equal-height rows + inbox potential-briefs preview |
| #124 | Fix: drag-reorder of fee lines persists reliably (was `.upsert()` with partial columns silently failing) |
| #125 | Fix: upcoming-shoots filter + hover card flips/portals to stay on screen |
| #126 | Fix: upcoming-shoots state expansion + over-fetch (the PR#125 fix was too narrow) |
| #127 | CLAUDE.md sync — entries 45-48 |

**Supabase migrations applied to prod**: 0050 (kill_switch_realtime), 0051 (dismissed_briefs + source_gmail_message_id on bookings), 0052 (dismissed_by uuid → text).

## Memory files the auto-memory system will load

These live in `/Users/saundersandcoagency/.claude/projects/-Users-saundersandcoagency-Desktop-atelier/memory/` and are loaded automatically:

- `user_jasper.md` — who Jasper is, role, how he works
- `feedback_collaboration.md` — collaboration preferences
- `feedback_estimates.md` — calibrate to Jasper's pace (minutes not hours)
- `feedback_code_gotchas.md` — recurring code mistakes
- `feedback_audit_methodology.md` — static vs Playwright runtime audits
- `feedback_investigation_strategy.md` — **investigate behavioural bugs on Opus, don't delegate to Haiku subagents** (Jasper has been burned by subagent miscalls)
- `feedback_function_name_check.md` — **NEW session 14**: verify functions named "upcoming/recent/overdue/active" actually enforce the filter
- `feedback_monitor_polling_exit_codes.md` — **NEW session 14**: Monitor scripts polling `gh pr checks` need brace-grouped `|| true` to survive `pipefail`
- `project_atelier.md` — platform facts not in CLAUDE.md
- `project_undo_pattern.md` — **NEW session 14**: reversibility doctrine; actions undoable until external side effect, toast + persistent recovery layers
- `project_audit_2026_05_15_pr_sequence.md` — historical, all 6 PRs landed

## Doctrine established this session

### Undo doctrine (live across the app)

> A click should be reversible UNTIL it produces an external side effect (email sent, calendar event delivered, money moved). After that point, the inverse becomes a new event — "send retraction email", not "undo send".

Two layers wherever applied:
1. **Toast undo (~8s)** for instant misclick recovery
2. **Persistent recovery** (e.g. Restore-to-pending button on Rejected tab, "Show N dismissed" toggle) for later

Live on: dismiss potential brief, convert-to-booking, reject approval, delete fee line, delete schedule row.

Shared component: `src/components/ui/UndoToast.tsx`. Use it for any future toast-undo.

### Function-name semantics

When writing a data-layer function whose name implies a time/scope filter (`getUpcomingShoots`, `getOverdueInvoices`, `listActiveTalent`...), VERIFY the query enforces the filter. Type checking and tests won't catch this — only a human reading code with the name in mind. Add this 30-second check to "before declaring done."

### Investigation strategy

For behavioural / correctness bugs (anything where "does the code do what its name says" is the question), investigate yourself on Opus. Don't delegate to Explore/Haiku subagents — they make confident but wrong calls. Mechanical searches ("where is X used", "find every callsite of Y") are fine to delegate.

## Open items on Jasper's side (NOT code work)

1. **Duplicate Jasper account** at `/settings/partners` — two Owner rows (work email + personal `jasperdouglasbailey@gmail.com`). One click on `Remove` for the work-email row.
2. **Patrick portal activity** — Patrick Mackey appears as Crew with linked entity in `/settings/partners`. Whether he's actually using the portal is unknown. Check `/audit?action=portal_*` filtered to his user_id, or just ask him.
3. **Scheduled jobs "Never run"** — verify Vercel dashboard shows `CRON_SECRET` is set in the Production env scope (not just Preview/Dev), and that the deployed branch IS the production deployment. Once a daily schedule ticks after a fresh production deployment, crons should fire. URL was `atelier-bice-mu.vercel.app` — confirm that's the production URL.

## Open items deferred (code work, future PRs)

- **Grid Planner redesign** — explicitly deferred. 575-line component with intentional Instagram brand colours (do NOT migrate to `PALETTE`). Right-side controls already use `PALETTE`; the phone-mock area is supposed to look like Instagram. A real refactor would need to touch interactive content, not just chrome — schedule a dedicated session.

## Known limitations / "things we tried and decided not to do"

- **Substitute talent** has no undo. The inline-panel with required-reason field provides some misclick protection. If misclick rate is high, add toast undo — but no signal yet.
- **Mark talent/crew paid** has no undo. Email already went out (remittance advice). Pattern would be "send retraction," not "undo send."
- **Approve approval** has no undo. Side effect (email/handler) fires immediately. Same retraction-pattern reasoning.
- **Anonymise**, **hard delete (typed `DELETE`)** — intentionally permanent.

## Where to read for more context

- **Worktree CLAUDE.md** — full build status (entries 1-48 cover everything)
- **Master CLAUDE.md** at `~/Documents/Claude/Projects/Beetle/CLAUDE.md` — canonical doctrine (tech stack, agents, lethal trifecta, kill switch, privacy)
- **ATELIER-HANDOFF.md** at `~/Documents/Claude/Projects/Beetle/ATELIER-HANDOFF.md` — integration status

## How to start the next session

```bash
# In the worktree at:
cd /Users/saundersandcoagency/Desktop/atelier/.claude/worktrees/laughing-haslett-6faebe

# Or in the main checkout — your call. Both have main up to date.
```

Then point the new assistant at this file (`docs/SESSION-14-HANDOFF.md`) — that, plus the auto-loaded CLAUDE.md and memory, gives them everything.
