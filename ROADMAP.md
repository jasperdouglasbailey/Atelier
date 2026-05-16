# ROADMAP — Atelier worktree

What's actually still ahead. Doctrine and ship-log live in `CLAUDE.md` and `CHANGELOG.md` respectively.

## Blocked on credentials

These are real product capability not yet live, gated on env vars Jasper needs to set in Vercel.

1. **Phase 2 — Xero invoice sync.** Three env vars: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` (must match `https://atelier.saundersandco.com.au/api/auth/callback/xero`). After OAuth flow runs once, `XERO_REFRESH_TOKEN` and `XERO_TENANT_ID` are persisted automatically. Unlocks pay-on-paid tracking (auto-flip a flag when client invoice paid) which currently has handlers ready but no trigger.

2. **`ANTHROPIC_API_KEY`** in Vercel. All LLM features (brief-intake, critique, brief-clarify, hold-request recommendations) degrade to no-op without it. Prompt caching plan in `docs/PROMPT-CACHING-PLAN.md` is ready to land savings on day one of real usage.

3. **`CRON_SECRET`** in Vercel Production env scope. Crons are coded but Vercel won't fire them without the matching secret. PR-1 from AUDIT-2026-05-15 added the env-presence indicator in Settings — should show ❌ today.

## Strategic — needs conversation before code

4. **"Where does Atelier go in 6 months?"** Is this a tool for Saunders, or a product for other agencies? The answer shapes everything else in this list. Deferred from sessions 14-15. Worth ~1h of conversation, no code.

5. **Corpus archive utility.** `atelier_corpus_bookings` collects anonymised data on every hard delete. Never read. Could power: cost benchmarks for "this brief looks like our last AJE shoot", typical-quote ranges by tier, win-rate signal per client type. Real signal value is unknown until we look at the data. ~30 min exploratory query session before deciding.

6. **Offensive agent automation.** Current agents (chase emails, compliance pings, brief intake) are all defensive — keep work moving. No agent currently *finds* work. Possible directions: "client X hasn't booked in 90 days, draft a check-in"; "new portfolio piece on Drive, draft Insta caption from brief"; "incoming brief looks like AJE format, pre-fill known fields." All speculative; needs framing per #4.

## Active build candidates

7. **Microsoft Graph webhooks** (replace polling — currently no MS Graph code in the build). Only matters when integrating with corporate clients on Outlook calendars. Low urgency.

8. **Pay-on-paid trigger** — handler exists; needs Xero (item 1).

9. **Anthropic model-version monitoring.** PR-G safety net (PR#155) logs `[anthropic] model X 404'd` warnings on fallback. Should add a Settings panel showing "Model X has fallen back N times this week" so we see rot before a generation goes fully dark. ~20 min once we have LLM usage data.

10. **Portal calendar drag-to-block range.** PR#161 shipped a single-day-then-range-input pattern. A real drag interaction (click + drag to select multiple cells) is the next refinement — mouse + touch + edge cases.

## Shipped — captured here so they don't re-appear in planning

- ~~Quote template expansion~~ — stylist + HMU shipped PR#28. Further expansion (manicurist, prop stylist, set design) only if Jasper books those disciplines often enough.
- ~~Comms agent expansion~~ — quote-chase PR#33, brief-clarify PR#34, tone variants PR#36, gallery-share PR#37. All shipped.
- ~~Insurance / BAS reminders dashboard~~ — shipped PR#34 at `/settings/business-renewals`.
- ~~Talent / crew expiry-renewal automated pings~~ — shipped PR#27 as `/api/cron/compliance-pings` (daily 22:00 UTC).
- ~~Data export / right-to-be-forgotten~~ — shipped PR#35 (`/api/export/{talent,client,crew}/[id]` + `anonymise{Talent,Client,Crew}Action` + `<DataRightsControls>`).
- ~~Tone variants per client~~ — shipped PR#36. `communication_style` on clients, `comms-tone.ts` utility.
- ~~Full agent prompt suite~~ — first slice shipped PR#32 (brief-intake `ConfidenceContract`, hold-requests `precedent_refs`). Send-quote critique-pass not added — body is template-driven, low signal.
- ~~Column-level RLS~~ — shipped PR#31 via `atelier_bookings_portal` view + dropped row policies.
- ~~Repeat-client autofill~~ — `getClientDefaultsAction()` + `BookingFormFields` autofill is live (majority threshold over last 3 bookings).
- ~~Brief → Quote → Send single screen~~ — `/inbox/[bookingId]` shipped with 3-step progress strip.
- ~~Compliance dashboard~~ — `/settings/compliance` shipped PR#27.
- ~~Prompt caching + model bump + insert fix + voice-rule refactor~~ — shipped PR#153 + PR#155 safety net.
- ~~CLAUDE.md split + types unification + cron unification + memory consolidation~~ — shipped PR#156–#158 + memory pass on 2026-05-16.
- ~~Portal real shoot dates~~ — shipped PR#159 (UI gap, not security).
- ~~Sydney weather strip in greeting~~ — shipped PR#160.
- ~~Portal interactive calendar with blockouts~~ — shipped PR#161. Click any day to block; existing bookings render as green/amber dots; replaces the old form-based UnavailabilityManager.

## Explicitly NOT on the roadmap

- Marketing agent / Planoly emulation / Klaviyo — descoped. Grid Planner is the only marketing-adjacent surface.
- Client portal — doctrine: clients never get logins, they get tokenised URLs only.
- Squarespace integration — skipped.
- Microsoft Teams integration — out of scope.
