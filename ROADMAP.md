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

7. **Brief intake — next-tier extension fields.** PR#169 fixed the heuristic dates + added structured usage taxonomy. The next field gaps (documented per fixture in `expected.ts`, not yet built): `brand` vs `agency` distinction (Brooke's Inaura/Smile split); `project_name` (Caleb's Archer Residences vs Coronation client); `candidate_dates[]` + `requested_shoot_count` (Brooke's "8th, 11th, 12th May — 1 x shoot date" multi-candidate pattern); `proposed_day_rate` + `proposed_post_rate` (when clients propose rates); `is_buyout` flag + negative-spec carve-outs ("No sound capture", "No VO"); `on_camera_count` (talent count distinct from photographer); `dates_confirmed: false` flag for soft dates; `deliverables_count_min/max` for ranges; `referrer`; `budget_explicit: true` for hard ceilings. All LLM-extractable; schema additions are cheap. Worth bundling 4-5 into one PR once we've seen another 10 real briefs to validate the shape.

8. **BUR replacement — structured usage → suggested fee.** PR#168 removed the fake BUR calculator. PR#170 added the structured taxonomy. The follow-up is a deterministic valuation: each (category × territory_pop × duration_months) combo has a base rate; sum across categories; apply consumer/trade/editorial multiplier; return suggested fee. Implementation is straight maths; the hard part is the rate table — needs Jasper's pricing data per category. Probably ~1h of his time + ~2h to wire.

9. **Microsoft Graph webhooks** (replace polling — currently no MS Graph code in the build). Only matters when integrating with corporate clients on Outlook calendars. Low urgency.

10. **Pay-on-paid trigger** — handler exists; needs Xero (item 1).

11. **Anthropic model-version monitoring.** PR-G safety net (PR#155) logs `[anthropic] model X 404'd` warnings on fallback. Should add a Settings panel showing "Model X has fallen back N times this week" so we see rot before a generation goes fully dark. ~20 min once we have LLM usage data.

12. **Portal calendar drag-to-block range.** PR#161 shipped a single-day-then-range-input pattern. A real drag interaction (click + drag to select multiple cells) is the next refinement — mouse + touch + edge cases.

## Shipped — captured here so they don't re-appear in planning

- ~~Bookings UX polish round 2~~ — shipped PR#222–#227 (2026-05-19). Default tier blank, JobFacts "Retouching" split into Grading + Retouching derived from existing fields, readable Usage row component (`<UsageSummary />`), zombie usage checkboxes swept from BriefParser, fashion-season vocab + title/location hallucination guards in LLM prompt, talent portal enriched with full JobFacts + crew status chips (migration 0072 recreated the portal view). Plus PR#221 hotfix for the dropped FK joins that 0071 missed (every booking detail page was 404'ing).
- ~~Bookings simplification + brief parser overhaul~~ — shipped PR#215–#219 (2026-05-19). `/bookings/new` cold-load <4s warm <2s, migration 0071 dropped 11 dead columns, JobFacts gap-fill (Agency/PO/Job/Budget/Notes inline), multi-artist support ("+ Add another artist", brief multi-match, preferred-crew union, lead artist drives template defaults — "primary" concept fully retired), brief parser producer extraction + grade/retouch split + bare-date trigger. Plan: `~/.claude/plans/pure-weaving-piglet.md`. **Action item:** `ANTHROPIC_API_KEY` not set on Vercel prod — banner shows "Heuristic mode"; set in Vercel project settings to unlock LLM extraction (date year inference, first-person pronoun rules, producer variant phrasings, talent_spec hint, structured usage taxonomy).
- ~~Clients section overhaul (Syngency-style tabs + schema)~~ — shipped PR#209/#210/#211 (2026-05-19). Tabbed detail page, migration 0070 (addresses split, tags, Xero pointer, important note, primary contact), Staff CRUD tab, tag-filter chip row on index, expanded Activity feed. Banking still in Xero only.
- ~~Multi-agent agency foundation (Phase 0 + 1)~~ — shipped PR#207/#208. DB-driven sign-in allowlist (`is_signin_email_allowed` RPC, closes Gary's bug), `talent.assigned_agent_user_id` + "My artists" / "All" ScopePill + co-managing display + brief-apply ownership routing. Bulk-reassignment UI deliberately deferred per YAGNI — build when triggered.
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
