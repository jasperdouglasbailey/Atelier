# Incident Response Plan — Saunders & Co Agency

**Effective:** 8 May 2026
**Owner:** Jasper Bailey (with partner backup: Jemma)
**Privacy contact:** privacy@saundersandco.com.au

This is the operational playbook for responding to a data security
incident affecting personal information held by Saunders & Co Agency.
It implements our obligations under:

- Australian Privacy Principle 11 (Security of personal information)
- Part IIIC of the Privacy Act 1988 — the **Notifiable Data Breaches
  (NDB) scheme**

The NDB scheme requires notification of any "eligible data breach" to
both the affected individuals and the Office of the Australian
Information Commissioner (OAIC) **within 30 days** of becoming aware of
it. This document is the standing procedure for meeting that obligation.

---

## What counts as an "eligible data breach"?

Per the Privacy Act, an eligible data breach occurs when **all three** of
these are true:

1. There is **unauthorised access to**, **unauthorised disclosure of**,
   or **loss of** personal information held by us.
2. The breach is likely to result in **serious harm** to one or more
   individuals (e.g. identity theft, financial loss, reputational
   damage, physical safety risk).
3. We have **not been able to prevent** the likely risk of serious harm
   through remedial action.

Examples that would meet the threshold:

- An attacker gains access to our Supabase database and exfiltrates
  talent or crew records (names, ABNs, super fund numbers, addresses).
- A laptop containing offline copies of personal information is stolen
  and not encrypted.
- A misconfigured RLS policy allows one talent to read another talent's
  banking-adjacent data (super fund, member number) for more than a
  trivial period.
- An email containing PII is sent to the wrong client and not recalled.

Examples that would **not** typically be eligible:

- Brief access by an internal user not authorised for that data, where
  the user did not retain or disclose the information.
- Loss of a public-facing document (e.g. a published quote) since the
  data is already public.
- An incident where we can confirm no one outside the agency saw the
  data.

If unsure: **treat it as eligible until proven otherwise.**

---

## Phase 1 — Discovery (0–4 hours)

Anyone who suspects a breach (Jasper, Jemma, a partner, a talent who
reports something odd) should immediately:

1. **Activate the kill switch.** Set the platform to "pause outbound"
   in Settings → Kill Switch. This stops automated emails, AI calls,
   and direct sends that could compound the incident.
2. **Notify the privacy contact.** Email privacy@saundersandco.com.au
   AND text Jasper directly. Don't rely on a single channel.
3. **Don't try to "fix" the system yet.** Preserve evidence: logs,
   screenshots, the suspected breach surface.
4. **Don't notify external parties (clients, talent, OAIC) yet.** Phase
   1 is internal triage only.

The 30-day NDB clock starts at the moment we become **aware** of facts
that would cause a reasonable person to suspect a breach. Document the
timestamp.

---

## Phase 2 — Assessment (within 30 days, target: 72 hours)

Within 30 days of becoming aware, we must reach a decision on whether
the incident is an eligible breach. In practice we aim for 72 hours.

The owner (Jasper) leads the assessment, with Jemma as backup if Jasper
is unavailable. Steps:

1. **Scope the breach.** What data was affected? How many individuals?
   What's the likely audience of the unauthorised access?
2. **Pull the audit log.** The `atelier_audit_log` table records every
   record-level change. Filter by the affected timeframe and entity.
3. **Pull integration logs.** Supabase logs (via the Supabase
   dashboard), Vercel logs, Google Workspace audit log if Gmail/Drive
   was the surface.
4. **Decide:** is this likely to cause serious harm? Factors:
   - Sensitivity of the data (banking details > address > name)
   - Volume (one record vs. thousands)
   - Recipient (an internal staff vs. a public dump)
   - Mitigations already in place (encryption, RLS, expired tokens)
5. **Document the decision.** Even if the decision is "not eligible,"
   write a short memo to the privacy folder with the facts and the
   reasoning. This is your evidence if ever audited.

---

## Phase 3 — Notification (if eligible)

If the assessment concludes the breach is eligible:

### Within 30 days of awareness, notify:

#### a. The OAIC

Via the OAIC's online Notifiable Data Breach form:
https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach

Required content (the form prompts for these):
- Identity and contact details of Saunders & Co
- Description of the breach (when, what data, suspected cause)
- The kinds of information involved
- Recommendations to affected individuals (what they should do)

#### b. Affected individuals

Each affected individual must be notified directly. Email is acceptable
where we have an email on file. The notification must include:

- Description of the breach in plain English
- Kinds of information involved (e.g. "your name, mobile, ABN, and
  superannuation member number were exposed")
- Recommendations (e.g. "monitor your bank account for suspicious
  activity," "update your password," "consider placing a credit ban
  with the credit reporting agencies")
- Saunders & Co's contact details for follow-up questions
- A statement that the OAIC has been notified

If direct notification is impracticable (we have no email/phone for the
affected individuals), publish the notice on our public website and
take reasonable steps to publicise it.

### Document everything

Every notification sent, every response received, every remediation
action taken. Keep copies for at least 7 years (matches our standing
record-keeping policy).

---

## Phase 4 — Remediation and prevention (rolling)

Once notification is out the door:

1. **Close the actual hole.** Patch the vulnerability, rotate the
   compromised credentials, restore from a known-good backup if needed.
2. **Re-enable the kill switch off** once the system is verified safe.
3. **Post-incident review.** Within 30 days of resolution, write a
   post-mortem covering:
   - Root cause (technical AND organisational)
   - What worked in the response
   - What didn't (where did time go that shouldn't have?)
   - Concrete preventions to avoid a recurrence
4. **Update this IRP.** If anything in the response surfaced a gap in
   this document, fix the document.

---

## Standing safeguards (so we don't get to Phase 1 in the first place)

These are already implemented in Atelier:

- **RLS** on every Postgres table; tested via column-level RLS portal view
- **Kill switch** for emergency outbound pause
- **Audit log** for every record-level change
- **Per-cron secrets** to limit blast radius if any one secret leaks
- **Retention crons** that auto-delete old approval records and AI call
  logs
- **OAuth state validation** on Google callback (CSRF protection)
- **Quote tokens expire** after 180 days
- **Drive folders are trashed** when an entity is anonymised

Things you (the owner) need to do that no code can fix:

- **MFA on Supabase, Vercel, Google Workspace, Anthropic, and GitHub.**
  Single-factor logins are the biggest live risk surface.
- **Quarterly backup restore drill** — pick a date, restore the
  Supabase backup to a throwaway project, verify it's complete.
- **External uptime monitoring** (UptimeRobot or similar) pinging
  `/api/health?probe=1` and alerting Jasper on failure.
- **Annual review** of this IRP — calendar reminder for 1 May each year.

---

## Contact list

| Role | Person | Channel |
|---|---|---|
| Privacy contact (lead) | Jasper Bailey | privacy@saundersandco.com.au, mobile (on file) |
| Privacy contact (backup) | Jemma | (on file) |
| OAIC | Office of the Australian Information Commissioner | 1300 363 992, https://www.oaic.gov.au |
| External legal | (to be appointed — recommend retainer with a privacy lawyer) | |
| External technical | (to be appointed — recommend a security incident responder) | |
