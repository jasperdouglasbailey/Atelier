# Privacy Contact Setup — Saunders & Co Agency

Our published privacy policy and APP 5 collection notices reference
`privacy@saundersandco.com.au` as the contact for access requests,
correction requests, anonymisation requests, and complaints.

**That email address has to actually exist and be monitored** — the
APP guidelines (para 1.22) explicitly require a real contact, not a
placeholder.

This document is the one-time setup checklist.

---

## Step 1 — Create the mailbox

In Google Workspace admin (admin.google.com):

1. Either create a new user `privacy@saundersandco.com.au`, or — cheaper
   and equally valid — create a **group alias** that routes to Jasper's
   inbox (and Jemma's, as backup).
2. Recommended: **alias / group**, not a user, since it's free and
   doesn't burn a Workspace seat.

Settings on the alias:

- Members: Jasper (owner), Jemma (backup)
- Posting: anyone outside the org can email it
- Access: Jasper and Jemma can read and reply

---

## Step 2 — Set a Gmail filter

So the privacy mail doesn't get lost in the inbox:

1. Open Gmail, Settings → Filters and Blocked Addresses → Create new filter
2. **To:** `privacy@saundersandco.com.au`
3. Apply label: `Privacy` (create if needed)
4. Star it
5. Don't auto-archive — keep these visible

---

## Step 3 — Add to the published policy

Once the mailbox exists, the agency platform's privacy policy at
`/privacy` and the collection notices on `/onboard` already reference
`privacy@saundersandco.com.au` (built from the agency-config domain).
No code change needed once the email exists.

If your domain ever changes (e.g. you move to a new TLD), update
`NEXT_PUBLIC_AGENCY_EMAIL` in Vercel env and redeploy.

---

## Step 4 — Response standards

When something lands in the privacy mailbox:

- **Acknowledge within 10 calendar days.** Even just "received, looking
  at it now."
- **Substantive response within 30 calendar days** (this is the APP 12
  / 13 standard for organisations).
- **Free of charge.** Don't bill for access, correction, or
  anonymisation work.
- **Use the IRP** (`docs/INCIDENT-RESPONSE-PLAN.md`) if the email is
  reporting a suspected breach, not a routine request.

A simple template for an access request response:

> Hi [name],
>
> Thanks for your request. I've attached a JSON export of every record
> we hold about you. This includes your profile, every booking you've
> been on, and the audit log of changes.
>
> If you'd like a different format (PDF, etc.) just let me know.
>
> If anything in there is wrong, let me know and I'll fix it within 30
> days at no charge — that's your right under APP 13. If you want us to
> anonymise the record entirely, I can do that too — just be aware it's
> one-way and we keep a structural skeleton for tax records (as the
> ATO requires).
>
> Cheers,
> Jasper

---

## Step 5 — Annual review

Calendar reminder for 1 May each year:

- Confirm the mailbox is still working
- Confirm the policy at `/privacy` is still accurate (especially the
  list of overseas processors in section 8)
- Confirm Jasper's and Jemma's contact details are current
- Test the IRP by walking through a hypothetical breach scenario
