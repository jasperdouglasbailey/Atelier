import { PALETTE } from '@/lib/utils/constants';
import InlineField from './InlineField';

type Props = {
  bookingId: string;
  agencyNotes: string | null;
};

/**
 * Right-rail panel for internal agency-only notes about the booking. Lives
 * here (not in the main column) so the spine stays focused on the
 * client-facing workflow. Inline-editable like the brief fields.
 */
export default function AgencyNotesPanel({ bookingId, agencyNotes }: Props) {
  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-title">
          Agency notes
        </h3>
        <span className="text-[10px]" style={{ color: PALETTE.muted, opacity: 0.7 }}>
          internal · click to edit
        </span>
      </div>
      <InlineField
        bookingId={bookingId}
        field="agency_notes"
        label=""
        value={agencyNotes}
        variant="textarea"
        placeholder="Add internal notes about this booking…"
      />
    </section>
  );
}
