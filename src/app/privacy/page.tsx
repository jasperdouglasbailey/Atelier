/**
 * Public privacy policy — Australian Privacy Principles 1.4 / 1.5.
 *
 * APP 1.5 requires this page to be available free of charge and in an
 * appropriate form. This is the "appropriate form" — a public Next.js
 * route, no authentication required, indexable by search engines.
 *
 * Every section below maps to a specific APP requirement:
 *   APP 1.4(a) — kinds of personal information we collect and hold
 *   APP 1.4(b) — how we collect and hold it
 *   APP 1.4(c) — purposes of collection / use / disclosure
 *   APP 1.4(d) — how to access and correct
 *   APP 1.4(e) — how to complain
 *   APP 1.4(f) — likely overseas disclosures
 *   APP 1.4(g) — countries the overseas recipients are in
 *   APP 2     — anonymity / pseudonymity options
 *   APP 7     — direct marketing posture
 *   APP 8     — cross-border disclosure framework
 *   APP 11.2  — retention and destruction
 *   APP 12    — access procedure
 *   APP 13    — correction procedure
 *   NDB       — Notifiable Data Breaches scheme posture
 *
 * If you change the policy, update LAST_UPDATED below. APP 1.4 expects
 * the policy to be up-to-date.
 */

import { getAgencyConfig } from '@/lib/utils/agency-config';

const LAST_UPDATED = '8 May 2026';

export const metadata = {
  title: 'Privacy Policy — Saunders & Co',
  description:
    'How Saunders & Co Agency collects, holds, uses, and discloses personal information under the Australian Privacy Principles.',
};

export default function PrivacyPolicyPage() {
  const agency = getAgencyConfig();
  const agencyName = agency.name;
  const privacyEmail = `privacy@${(agency.email ?? 'saundersandco.com.au').split('@').pop()}`;
  const generalEmail = agency.email ?? 'info@saundersandco.com.au';

  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '40px 24px 80px',
        background: '#fff',
        color: '#1a1a1a',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
        lineHeight: 1.6,
      }}
    >
      <header style={{ borderBottom: '1px solid #e8e8e8', paddingBottom: 24, marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a7a7a' }}>
          {agencyName}
        </div>
        <h1 style={{ marginTop: 8, marginBottom: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Privacy Policy
        </h1>
        <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
          Effective: {LAST_UPDATED}. Issued in accordance with the{' '}
          <a href="https://www.oaic.gov.au/privacy/australian-privacy-principles" target="_blank" rel="noreferrer" style={{ color: '#3b5bdb' }}>
            Australian Privacy Principles
          </a>{' '}
          under the Privacy Act 1988 (Cth).
        </div>
      </header>

      <section>
        <h2 style={h2}>1. About this policy</h2>
        <p>
          {agencyName} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a
          photography production agency based in Sydney, Australia. We handle
          personal information about talent (artists), crew, clients,
          brand contacts, and the people we deal with in the course of running
          shoots and producing content.
        </p>
        <p>
          This policy explains how we collect, hold, use, and disclose
          personal information, in accordance with our obligations under the
          Privacy Act 1988 (Cth) and the Australian Privacy Principles
          (APPs). It applies to all personal information we hold,
          regardless of how we collected it.
        </p>
        <p>
          We treat personal information as the property of the individual it
          relates to. We collect only what we need to do our work, hold it
          only as long as we need it, and dispose of it when we don&apos;t.
        </p>
      </section>

      <section>
        <h2 style={h2}>2. The kinds of personal information we collect and hold</h2>
        <p style={{ marginBottom: 8 }}>
          The personal information we collect and hold depends on the
          relationship we have with you.
        </p>

        <h3 style={h3}>If you are a talent (artist) we represent or book</h3>
        <ul style={ul}>
          <li>Working name, legal name, pronouns, date of birth</li>
          <li>Contact details: email, mobile phone, postal address</li>
          <li>Professional details: discipline, specialty, day rate, representation status, social handles, website</li>
          <li>Business details: ABN, GST registration, superannuation fund details, Xero contact ID, banking arrangements (banking details are stored only in Xero, never in our agency platform)</li>
          <li>Emergency contact: name, relationship, mobile</li>
          <li>Documents and compliance: passport expiry, drivers licence expiry, Working with Children Check (WWCC) number and expiry, work rights, visa expiry</li>
          <li>Call-sheet preferences: dietary requirements, drink order</li>
          <li>Booking history with us, fee lines, payment status</li>
        </ul>

        <h3 style={h3}>If you are crew we book</h3>
        <ul style={ul}>
          <li>Full name, date of birth, home address, city/home base</li>
          <li>Contact details: email, mobile, preferred communication channel</li>
          <li>Role(s), tier, certifications, kit list</li>
          <li>Business details: ABN, GST registration, superannuation fund details, Xero contact ID, banking arrangements (banking details stored only in Xero)</li>
          <li>Call-sheet preferences: dietary requirements, drink order</li>
          <li>Booking history with us</li>
        </ul>

        <h3 style={h3}>If you are a client or brand contact</h3>
        <ul style={ul}>
          <li>Name, role, company, email, mobile</li>
          <li>Communication style preference</li>
          <li>Brief content you send us; quote and booking history</li>
        </ul>

        <h3 style={h3}>Sensitive information (treated with extra care)</h3>
        <p>
          Some information we hold meets the Privacy Act&apos;s definition of
          &quot;sensitive information&quot;. Specifically, dietary
          requirements may indirectly reveal religious affiliation (for
          example, halal or kosher diets), and Working with Children Check
          information is regulated. Where we collect sensitive information,
          we collect only what is strictly necessary, and we apply additional
          safeguards (per APP 11).
        </p>
      </section>

      <section>
        <h2 style={h2}>3. How we collect personal information (APP 1.4(b))</h2>
        <p>We collect personal information in the following ways:</p>
        <ul style={ul}>
          <li>
            <strong>Directly from you</strong>: when you fill in our
            onboarding form, send us a brief, sign a deal memo, accept a hold
            request, or correspond with us by email, phone, or in person.
          </li>
          <li>
            <strong>From your representatives</strong>: agents, managers, or
            colleagues acting for you may share your details with us in the
            course of arranging work.
          </li>
          <li>
            <strong>Generated by your interactions with us</strong>: booking
            history, fee lines, call sheets, and the audit log of changes
            made to your record are generated as we work together.
          </li>
          <li>
            <strong>From publicly available sources</strong>: where
            relevant, professional social profiles (e.g. an Instagram handle
            you have published) and your website.
          </li>
        </ul>
        <p>
          We do not buy personal-information lists from third parties.
        </p>
      </section>

      <section>
        <h2 style={h2}>4. How we hold personal information (APP 1.4(b))</h2>
        <p>
          We hold personal information primarily in our internal agency
          platform (called Atelier), which uses third-party cloud services
          listed under section 8 (overseas disclosures) below. Banking
          details are held exclusively in our accounting system (Xero) and
          never replicated into the agency platform.
        </p>
        <p>
          Personal information may also reside in our email (Google
          Workspace), file storage (Google Drive folders linked to bookings),
          calendar (Google Calendar), and any contracts or briefs we have
          received as documents.
        </p>
        <p>
          We apply technical and organisational security measures consistent
          with APP 11 (security) — see section 11 below.
        </p>
      </section>

      <section>
        <h2 style={h2}>5. Why we collect, hold, use, and disclose personal information (APP 1.4(c))</h2>
        <p>The primary purposes are operational and contractual:</p>
        <ul style={ul}>
          <li>Receiving and parsing creative briefs from clients</li>
          <li>Drafting and sending quotes</li>
          <li>Identifying and engaging suitable talent and crew for a shoot</li>
          <li>Producing call sheets, deliverables, and post-production assets</li>
          <li>Issuing invoices, processing remittance, and meeting tax and superannuation obligations</li>
          <li>Maintaining records required by law (for example, ATO record-keeping under taxation laws — generally 7 years)</li>
          <li>Communicating with you about a current or proposed engagement</li>
          <li>Resolving complaints and disputes</li>
        </ul>
        <p>
          We use personal information only for the primary purpose for which
          we collected it, or for a related secondary purpose that you would
          reasonably expect (for example, sending an updated call sheet
          after dates change).
        </p>
      </section>

      <section>
        <h2 style={h2}>6. Direct marketing (APP 7)</h2>
        <p>
          The agency platform itself does not send direct marketing
          communications. Operational communications relating to a specific
          booking — quote follow-ups, post-shoot chases, compliance
          reminders, and the like — are not direct marketing.
        </p>
        <p>
          Where we do send promotional or marketing communications outside
          the platform (for example, a campaign newsletter), we provide a
          simple opt-out at the time and honour it within 30 days.
        </p>
      </section>

      <section>
        <h2 style={h2}>7. Dealing with us anonymously or by pseudonym (APP 2)</h2>
        <p>
          You can deal with us anonymously or by pseudonym for general
          enquiries (for example, asking what services we offer). For most
          operational matters — booking work, signing a deal memo, being
          paid — we will need to identify you. Australian taxation, super,
          and Working-with-Children-Check requirements oblige us to collect
          identifying information for those purposes (APP 2.2(a)).
        </p>
        <p>
          Clients viewing a quote we have sent receive a tokenised public
          link that does not require login or account creation
          (<a href="#access" style={{ color: '#3b5bdb' }}>see section 9</a>).
        </p>
      </section>

      <section>
        <h2 style={h2}>8. Disclosure to overseas recipients (APP 1.4(f)–(g), APP 8)</h2>
        <p>
          We use a small set of cloud service providers to operate our
          agency. These providers may store or process personal information
          outside Australia. Where they do, we have taken reasonable steps to
          ensure that they handle personal information in accordance with
          the APPs (APP 8.1).
        </p>
        <p>The current overseas recipients are:</p>
        <ul style={ul}>
          <li>
            <strong>Supabase</strong> (database and authentication) — the
            project is hosted in <strong>India (Mumbai region)</strong>.
            This is where the bulk of personal information sits at rest.
          </li>
          <li>
            <strong>Anthropic</strong> (AI provider used to parse briefs,
            draft emails, and assist with workflows) — processes data in
            the <strong>United States</strong>. We send only the minimum
            content needed for a given task.
          </li>
          <li>
            <strong>Google LLC</strong> (Workspace, Drive, Gmail, Calendar)
            — processes data primarily in the <strong>United States</strong>{' '}
            and other regions per Google&apos;s data location policies.
          </li>
          <li>
            <strong>Vercel Inc.</strong> (web hosting / infrastructure) —
            processes data primarily in the <strong>United States</strong>.
          </li>
        </ul>
        <p>
          We may engage other contractors from time to time. Where this
          would result in a new overseas disclosure, we will update this
          policy.
        </p>
      </section>

      <section id="access">
        <h2 style={h2}>9. Accessing and correcting your personal information (APP 12, APP 13)</h2>
        <p>
          You have the right to ask us what personal information we hold
          about you, and to ask us to correct it if it is inaccurate, out of
          date, incomplete, irrelevant, or misleading.
        </p>

        <h3 style={h3}>How to make a request</h3>
        <p>
          Email <a href={`mailto:${privacyEmail}`} style={{ color: '#3b5bdb' }}>{privacyEmail}</a>{' '}
          with a description of what you want to access or correct. There is
          no formal form to fill in. We will not charge you for making a
          request, for providing access, or for making a correction (APP
          12.7, APP 13.5(b)).
        </p>

        <h3 style={h3}>Our response time</h3>
        <p>
          We will respond within 30 calendar days of receiving your request
          (APP 12.4(a)(ii) and APP 13.5(a)). If we cannot meet that
          timeframe — for example, because the request is unusually broad —
          we will tell you why and propose an alternative timeline.
        </p>

        <h3 style={h3}>Self-service options</h3>
        <p>
          If you are talent or crew we work with regularly, you may already
          have access to a portal where you can view and update much of
          your information directly. Ask us if you don&apos;t.
        </p>

        <h3 style={h3}>If we refuse</h3>
        <p>
          In limited circumstances we may refuse access (for example, where
          giving access would have an unreasonable impact on the privacy of
          another person, or would prejudice a legal claim). If we refuse,
          we will give you a written reason and explain how you can complain
          (APP 12.9, APP 13.3).
        </p>

        <h3 style={h3}>Right to be forgotten (anonymisation)</h3>
        <p>
          You may also ask us to anonymise your personal information. We
          will replace your identifying details with a random code and null
          out PII fields, while keeping the structural skeleton of your
          booking history for our financial records as required by Australian
          tax law (APP 11.2 and the ATO&apos;s 7-year retention requirement).
          Anonymisation is one-way — once done it cannot be reversed.
        </p>

        <h3 style={h3}>Automatic destruction after 7 years</h3>
        <p>
          We run a daily process that automatically anonymises the records
          of inactive talent, crew, and clients who have not appeared on a
          booking within the last 7 years. This implements APP 11.2
          (destruction or de-identification of personal information no longer
          needed for any purpose).
        </p>
      </section>

      <section>
        <h2 style={h2}>10. Complaints (APP 1.4(e))</h2>
        <p>If you believe we have breached the APPs, please tell us.</p>

        <h3 style={h3}>Step 1 — Contact us first</h3>
        <p>
          Email{' '}
          <a href={`mailto:${privacyEmail}`} style={{ color: '#3b5bdb' }}>
            {privacyEmail}
          </a>
          {' '}with a description of the conduct you believe is in breach. We
          will acknowledge your complaint within 10 calendar days and aim to
          resolve it within 30 calendar days.
        </p>

        <h3 style={h3}>Step 2 — Office of the Australian Information Commissioner</h3>
        <p>
          If you are unhappy with how we handled your complaint, you can
          take the matter to the OAIC.
        </p>
        <ul style={ul}>
          <li>Web: <a href="https://www.oaic.gov.au" target="_blank" rel="noreferrer" style={{ color: '#3b5bdb' }}>www.oaic.gov.au</a></li>
          <li>Phone: 1300 363 992</li>
          <li>Post: GPO Box 5218, Sydney NSW 2001</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>11. How we secure personal information (APP 11)</h2>
        <p>
          We take reasonable technical and organisational steps to protect
          personal information from misuse, interference, loss, unauthorised
          access, modification, and disclosure (APP 11.1, APP 11.3).
        </p>
        <p>Without disclosing details that would compromise our security:</p>
        <ul style={ul}>
          <li>Database access is gated by row-level security, with a strict role-based policy distinguishing owner, partner, talent, and crew accounts.</li>
          <li>All connections are encrypted in transit (HTTPS / TLS).</li>
          <li>The agency platform sets HSTS, X-Frame-Options, and Permissions-Policy headers, and the public quote viewer ages out tokens after 180 days.</li>
          <li>OAuth flows for Google integration use signed CSRF state cookies.</li>
          <li>Every change to a record is recorded in a tamper-evident audit log.</li>
          <li>A &quot;kill switch&quot; allows us to immediately pause all outbound communications and AI calls in the event of a suspected incident.</li>
        </ul>
        <p>
          No system is perfectly secure. If a security incident occurs that
          meets the threshold of an &quot;eligible data breach&quot; under
          the Notifiable Data Breaches (NDB) scheme, we will notify
          affected individuals and the OAIC as required by Part IIIC of the
          Privacy Act.
        </p>
      </section>

      <section>
        <h2 style={h2}>12. Retention and destruction (APP 11.2)</h2>
        <p>We hold personal information for as long as we need it for the purposes for which it was collected. Specifically:</p>
        <ul style={ul}>
          <li><strong>Active talent / crew / client records</strong> — held for as long as the working relationship is active.</li>
          <li><strong>Inactive records</strong> — kept for up to 7 years to meet the Australian Taxation Office&apos;s record-keeping requirement, then automatically anonymised.</li>
          <li><strong>Approval queue records</strong> — pending approvals expire at 30 days; expired records are hard-deleted at 180 days.</li>
          <li><strong>AI call logs</strong> — retained for 90 days then purged.</li>
          <li><strong>Public quote viewer tokens</strong> — automatically expire 180 days after issue.</li>
        </ul>
        <p>
          You may at any time ask us to anonymise your record sooner than
          this; see section 9 above.
        </p>
      </section>

      <section>
        <h2 style={h2}>13. Children</h2>
        <p>
          We do not knowingly collect personal information from children
          under 18 in the course of running the agency platform, except in
          the limited case where a young performer is a talent we
          represent or work with. In those cases we collect only what is
          necessary, and we deal with parents, guardians, or representatives
          rather than the child directly.
        </p>
      </section>

      <section>
        <h2 style={h2}>14. Updates to this policy (APP 1.5)</h2>
        <p>
          We may update this policy from time to time as our practices
          change or as the law evolves. The current version is always
          available at this URL. The &quot;effective&quot; date at the top
          tells you when it was last changed.
        </p>
      </section>

      <section>
        <h2 style={h2}>15. Contact us</h2>
        <p>
          For privacy enquiries, complaints, or requests for access or correction:
        </p>
        <ul style={ul}>
          <li>Privacy contact: <a href={`mailto:${privacyEmail}`} style={{ color: '#3b5bdb' }}>{privacyEmail}</a></li>
          <li>General enquiries: <a href={`mailto:${generalEmail}`} style={{ color: '#3b5bdb' }}>{generalEmail}</a></li>
          {agency.address && <li>Postal address: {agency.address}</li>}
          {agency.phone && <li>Phone: {agency.phone}</li>}
          {agency.abn && <li>ABN: {agency.abn}</li>}
        </ul>
      </section>

      <footer
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: '1px solid #e8e8e8',
          fontSize: 12,
          color: '#7a7a7a',
        }}
      >
        Issued under the Privacy Act 1988 (Cth) and the Australian Privacy Principles. {agencyName} is the responsible entity for the personal information described in this policy.
      </footer>
    </main>
  );
}

const h2: React.CSSProperties = { marginTop: 36, marginBottom: 12, fontSize: 18, fontWeight: 700 };
const h3: React.CSSProperties = { marginTop: 20, marginBottom: 6, fontSize: 14, fontWeight: 600 };
const ul: React.CSSProperties = { paddingLeft: 22, marginTop: 6, marginBottom: 12 };
