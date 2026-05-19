import { PALETTE } from '@/lib/utils/constants';

/**
 * "Important" pinned-note banner for detail pages.
 *
 * Reusable: lives under /clients today but the shape is generic — same
 * component should work on talent and crew detail pages once they get
 * an `important_note` column.
 *
 * Renders nothing when `note` is null/empty so callers can drop it in
 * unconditionally without guarding at the call site.
 */
type Props = {
  /** The pinned-note text. `null`/`''` renders nothing. */
  note: string | null | undefined;
};

export default function ImportantPanel({ note }: Props) {
  if (!note || !note.trim()) return null;

  return (
    <section
      className="rounded-lg border-l-4 p-3"
      style={{
        background: `${PALETTE.warning}10`,
        borderLeftColor: PALETTE.warning,
        borderTop: `1px solid ${PALETTE.border}`,
        borderRight: `1px solid ${PALETTE.border}`,
        borderBottom: `1px solid ${PALETTE.border}`,
      }}
      role="note"
      aria-label="Important note"
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: PALETTE.warning }}
      >
        Important
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.text }}>{note}</p>
    </section>
  );
}
