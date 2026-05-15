# Cron Ops Runbook

> **When to use this:** the `/settings` Scheduled Jobs panel shows every cron
> as "Never run" (or shows `CRON_SECRET missing ✗`), AND/OR the audit log has
> zero `cron_*_run` entries for several days. This is the playbook from
> AUDIT-2026-05-15 P0.

The eight daily crons (`quote-chase`, `post-shoot-chase`, `compliance-pings`,
`tomorrow-digest`, `talent-gallery-ping`, `lock-ot-windows`, `data-retention`,
`auto-anonymise`) are scheduled in `vercel.json` and authorised by the
`CRON_SECRET` env var (or per-cron `CRON_SECRET_<NAME>` overrides). If the
secret is missing in Vercel Production, every cron returns 401 and the daily
automation layer is silently inert — including the APP 11.2 data-retention
cron.

---

## Step 1 — Confirm the env presence indicator

Open `https://atelier.saundersandco.com.au/settings` and scroll to the
**Scheduled Jobs** section.

- `CRON_SECRET detected ✓` → skip to Step 3 (jobs ran, secret is set, the
  cause is elsewhere — usually plan tier or schedule drift).
- `CRON_SECRET missing ✗` → continue with Step 2.

---

## Step 2 — Set `CRON_SECRET` in Vercel Production

1. Open the Vercel dashboard:
   `https://vercel.com/<your-team>/atelier/settings/environment-variables`
2. Click **Add New**.
3. **Key:** `CRON_SECRET`
4. **Value:** generate a 32-byte random string. From your terminal:
   ```bash
   openssl rand -base64 32
   ```
   Copy the output.
5. **Environments:** check **Production** only (don't expose this in
   Preview/Development — those don't run scheduled crons and the variable
   surface area should stay minimal).
6. Click **Save**.
7. **Redeploy** — env vars only take effect on the next build. Either:
   - Push an empty commit:
     `git commit --allow-empty -m "Re-deploy: register CRON_SECRET" && git push`
   - OR Vercel dashboard → Deployments → top deployment → **⋯** → **Redeploy**.
8. Wait for the deploy to finish (≈90s).
9. Refresh `/settings` — Scheduled Jobs indicator should now read
   `CRON_SECRET detected ✓`.

---

## Step 3 — Verify Vercel plan tier supports 8 cron jobs

The Vercel Hobby plan allows **2** cron jobs. Atelier ships 8 (see
`vercel.json`). The Pro plan (paid) is required.

1. Vercel dashboard → **Settings** → **General** (top of left rail).
2. Look at the plan badge near your team name. If it reads **Hobby**,
   only 2 of the 8 crons will be registered and the rest will silently
   not run.
3. If on Hobby: upgrade to Pro
   (`https://vercel.com/<your-team>/settings/billing`). Pro supports 40
   cron jobs per project.
4. After upgrading, force a redeploy (same flow as Step 2.7) so all 8
   schedules from `vercel.json` register.

---

## Step 4 — Verify the cron jobs are registered

1. Vercel dashboard → your project → **Cron Jobs** tab (in the top bar
   alongside Deployments / Functions / Logs).
2. You should see all 8 entries listed:

   | Path | Schedule (UTC) |
   |---|---|
   | `/api/cron/lock-ot-windows` | `0 16 * * *` |
   | `/api/cron/tomorrow-digest` | `0 20 * * *` |
   | `/api/cron/post-shoot-chase` | `0 21 * * *` |
   | `/api/cron/quote-chase` | `30 21 * * *` |
   | `/api/cron/talent-gallery-ping` | `45 21 * * *` |
   | `/api/cron/compliance-pings` | `0 22 * * *` |
   | `/api/cron/data-retention` | `30 3 * * *` |
   | `/api/cron/auto-anonymise` | `15 4 * * *` |

3. Any missing → the build didn't pick up `vercel.json`. Trigger another
   deploy and re-check.

4. Each row has a **Logs** link — click into one and confirm the last
   invocation returned 200, not 401. A 401 means `CRON_SECRET` is missing
   or doesn't match what Vercel injects.

---

## Step 5 — Manual trigger (your terminal) to test auth

You can hit any cron endpoint directly with the secret as a Bearer
token to verify auth without waiting for the next scheduled tick.

```bash
# Get the secret you set in Step 2 — Vercel dashboard → Settings →
# Environment Variables → CRON_SECRET → Show value. Copy it.
export CRON_SECRET='paste-the-value-here'

# Hit a cron endpoint (quote-chase is fastest to verify since it just
# scans for stuck quote_sent bookings):
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://atelier.saundersandco.com.au/api/cron/quote-chase
```

Expected response:

- **200** with a JSON body like `{"ok":true,"queued":N,"skipped":M}` → cron
  runs successfully. Refresh `/settings` — that job's "Last run" should
  flip to "Today" within a few seconds.
- **401** `{"error":"Unauthorized"}` → secret mismatch. Re-check Step 2
  set the value in **Production** specifically, and that you redeployed.
- **500** → the handler ran but errored. Check Vercel function logs for
  that path.

**Always `unset CRON_SECRET` from your shell after testing** — don't let it
linger in your shell history or environment.

---

## Step 6 — Wait one full cycle, then verify audit log

After the next cron firing window (UTC times above), check
`/audit?action=cron_quote_chase_run` (or any other cron's `_run` action).
You should see fresh rows. If you do, the automation layer is healthy and
this incident is closed.

Optional: a quick post-fix sanity check is to look at `/settings` again —
every job should show **Today** in the Scheduled Jobs list within 24 hours
of the fix.

---

## Per-cron secret overrides (advanced, optional)

Each cron also accepts a per-cron secret named
`CRON_SECRET_<NAME>` (e.g. `CRON_SECRET_QUOTE_CHASE`). This is a defence-
in-depth feature: if one secret leaks, you can rotate just that one without
breaking the other 7. Vercel sends the shared `CRON_SECRET` by default;
to use per-cron secrets, configure a custom `Authorization` header on
the cron in `vercel.json` (Pro tier feature) and set the matching
`CRON_SECRET_<NAME>` env var.

In the absence of any per-cron override, the shared `CRON_SECRET` is the
only thing that needs to be set.

---

## Companion incident — Gmail send failures

AUDIT-2026-05-15 also flagged 2× `client_quote_chase_email_send_failed`
rows. This is a related-but-distinct failure mode: the cron ran (so its
auth was fine), it queued approval emails, Jasper approved them, but
the actual Gmail send step failed. Cause is almost always Gmail OAuth
token expiry. Same investigation flow:

1. `/settings` → **Integrations** → **Google**. Status should read
   "Token valid" with all 5 scopes ticked.
2. If it shows "Token expired or revoked" or any scope is `✗`:
   click **Reconnect Google** to redo the OAuth flow. The refresh token
   is stored in `GOOGLE_REFRESH_TOKEN` env var on Vercel and is rotated
   automatically by the OAuth start route on the next sign-in.
3. After reconnecting, look for an existing draft of the failed email
   in Gmail Drafts and re-send manually, OR wait for the next
   quote-chase cron run to re-queue.
4. Confirm the fix held by checking `/audit?action=client_quote_chase_email_send_failed`
   doesn't get fresh rows over the next 24 hours.

The same fix applies to the four other failure modes that share the
underlying Gmail token:

- `send_quote_email_failed`
- `draft_quote_email_failed`
- `send_onboarding_link_failed`
- `client_brief_clarify_email_send_failed`

If a token refresh doesn't resolve it, the failure is something else
(rate limit, recipient bounce, etc.) — open the actual audit row's
`diff` column to see the underlying error message.
