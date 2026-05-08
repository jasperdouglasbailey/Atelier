/**
 * Talent / crew portal data-rights panel.
 *
 *   "Download my data" — calls the per-entity export endpoint, which is
 *      self-accessible to the entity (APP 12 right of access).
 *   "Request anonymisation" — opens an email to privacy@... with a
 *      pre-filled subject line. Owner / partner reviews and actions
 *      manually because anonymise is irreversible (see the master
 *      DataRightsControls component on the admin side).
 *
 * Pure presentational — no state, no actions of its own.
 */

import { getAgencyConfig } from '@/lib/utils/agency-config';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  type: 'talent' | 'crew';
  id: string;
  name: string;
};

export default function PortalDataRights({ type, id, name }: Props) {
  const agency = getAgencyConfig();
  const privacyEmail = `privacy@${(agency.email ?? 'saundersandco.com.au').split('@').pop()}`;

  const subject = encodeURIComponent(`Anonymisation request — ${name}`);
  const body = encodeURIComponent(
    `Hi,\n\nUnder Australian Privacy Principle 13, I'd like to request that you anonymise my personal information held by ${agency.name}.\n\nI understand that anonymisation is one-way and that some structural booking history will be retained for tax record-keeping.\n\nMy ${type} record name: ${name}\n\nThanks.`
  );
  const mailto = `mailto:${privacyEmail}?subject=${subject}&body=${body}`;

  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        Privacy & data rights
      </h3>
      <p className="mb-3 text-[11px]" style={{ color: PALETTE.muted, lineHeight: 1.5 }}>
        Under the Australian Privacy Principles, you can ask us for a copy
        of everything we hold about you (APP 12), or ask us to delete /
        anonymise it (APP 13). Both are free.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/export/${type}/${id}`}
          download
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{
            background: `${PALETTE.accent}18`,
            color: PALETTE.accent,
            border: `1px solid ${PALETTE.accent}44`,
          }}
        >
          ⤓ Download my data (JSON)
        </a>

        <a
          href={mailto}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{
            background: `${PALETTE.danger}18`,
            color: PALETTE.danger,
            border: `1px solid ${PALETTE.danger}44`,
          }}
        >
          ✉ Request anonymisation
        </a>
      </div>

      <p className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
        Anonymisation requests are processed manually by Saunders &amp; Co
        within 30 calendar days. See the{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: PALETTE.accent }}>
          full privacy policy
        </a>
        .
      </p>
    </section>
  );
}
