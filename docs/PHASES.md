# Atelier — Phase Map

> Source of truth: `~/Documents/Claude/Projects/Beetle/atelier-phase-1-build-spec.md`.
> This file is the in-repo cheat sheet — when Jasper asks "is X in a later
> phase?", look here first.

## Phase 1 (current)

What ships now. If a feature isn't in Phase 1, it doesn't ship now.

**Done in current build:**
- Foundation (Next.js + Supabase + Tailwind)
- Data model + seeded RLS placeholders
- Kill switch (red/amber/green) + audit log + cost telemetry + idempotency
- Bookings list + detail + edit + new
- Talent + Crew CRUD with discipline + preferred comms
- Quote builder + fee engine (anchored to Oliver AJE eComm #3579)
- Print views: client quote, client invoice, **artist remittance** (new), **crew bill / RCTI** (new)
- 13-state booking machine + auto-hold-request on quote_sent
- Approval queue (Inbox) — every outbound action queued before send
- Magic-link auth (Supabase) + middleware enforcement + email allowlist
- Google OAuth (Gmail + Drive + Calendar) — single grant, all 5 scopes live
- **Gmail send / draft / send-draft / search** — real (no longer stub) ✅
- **Drive folder creation** — real (findOrCreate, idempotent); quote_confirmed auto-creates 6 folders; final_delivery creates Finals shared link ✅
- **Calendar event creation** — real all-day events; quote_confirmed creates shoot event; release/cancel deletes it ✅
- **Inline client + brand creation in BookingForm** — "New client…" / "New brand…" quick-create without leaving the form ✅
- Reports + Costs dashboards
- Lethal trifecta refusal clause auto-prepended to every LLM call
- Artist disciplines (photographer, videographer, H&MU, etc.) — required field

**Remaining Phase 1 work:**
- Brief Intake agent (live LLM call) — heuristic parser works; LLM call is wired but not yet exercised in approval-flow
- Scheduled tasks runtime (cron / Vercel scheduled functions for OT 7-day window, post-shoot client chase 7/14/22/30, etc.)
- Per-booking comms tab — Gmail threads matching booking_ref shown in booking detail
- E2E smoke test on a real new booking
- Pre-launch checklist

## Phase 2 (next)

Per build spec "Phase 2 priorities, in order of leverage":

- **GitHub crew system fold-in** — for now, crew lives in Atelier; Phase 2 unifies with the existing GitHub crew system.
- **Microsoft Graph webhooks** — N/A (we migrated to Google; equivalent would be Gmail Push notifications, parked).
- **Insurance / BAS reminders** — scheduled automation.
- **Data export / right-to-be-forgotten** — APP 12 right of access, APP 13 correction. Build BEFORE onboarding real talent.
- **Onboarding form yearly re-confirm** — stubbed cron in Phase 1, lives in Phase 2.

## Phase 3 (later)

- **Marketing agent** — Planoly emulation, content calendar, Klaviyo.
- **Partner onboarding** — Jemma Williams, Gary Saunders. Multi-tenant abstractions activate here (seams already in Phase 1).
- **Signal library proactive pings** — DOI drift, rate delta vs client history, parent-company portfolio, etc. Depends on a few months of corpus before useful.
- **Twilio / iMessage / SMS integrations** — explicitly excluded from Phase 1.
- **Canva MCP integration**.
- **Rate intelligence** — propose-not-lock model needs corpus to anchor (3+ entries within band).

## Phase 4 (much later)

- **Mood boards / treatment builders**.
- **On-set mode** — shoot-day specific UI.
- **Conflict detection / advanced availability** — beyond simple state.

## Jasper's outstanding notes — phase mapping

| Note | Phase | Status |
|---|---|---|
| "We are the ones requesting a hold" — wording bug | Phase 1 | **FIXED** in this commit |
| "When will actual emails... be shown in inbox" | Phase 1 | Gmail send is real now; per-booking comms aggregation (Chunk 4 polling) is the next bit |
| "Distinction between inbox and outbox" | Phase 1 | Implicit in Chunk 4 — needs design |
| Auto-generation of invoice versioning history | Phase 1 | Quote versioning exists; invoice versioning is gap |
| "Latency... not very smooth" | Not phased | Performance pass — investigate server actions on every nav |
| Inline client+brand creation in BookingForm | Not phased | UX improvement; small scope |
| Soft-delete + archive talent UI | Not phased | **DONE** in this commit |
| "Real emails appearing" | Phase 1 Chunk 4 | Send is live; inbound polling next |
| Intelligent insights, rates | **Phase 3** | Corpus-dependent; signals can't anchor until 3+ entries. Don't promise sooner. |
| Twilio / SMS for iMessage | **Phase 3+** | Explicitly excluded from P1 |
| Marketing tools | **Phase 3** | Marketing agent lives here |
| Mood boards | **Phase 4** | Far out |
| Multi-tenant (Jemma, Gary) | **Phase 3** | Seams in P1, activation in P3 |
| GitHub crew fold-in | **Phase 2** | Until then, crew system runs parallel |

## When in doubt

If a request comes in that the spec doesn't cover, log it as a deviation
in `phase-1-deviations.md` and review before adding. The spec is locked.
