import { PALETTE } from '@/lib/utils/constants';
import type { Booking } from '@/lib/types/database';

type Props = {
  booking: Pick<Booking, 'drive_root_link' | 'drive_folder_ids' | 'calendar_event_id'>;
};

const FOLDER_KEYS = ['briefs', 'selects', 'retouched', 'finals', 'admin'] as const;
const FOLDER_LABELS: Record<typeof FOLDER_KEYS[number], string> = {
  briefs: 'Briefs',
  selects: 'Selects',
  retouched: 'Retouched',
  finals: 'Finals',
  admin: 'Admin',
};

/**
 * Right-rail panel showing every external file location for this booking:
 * Drive root + auto-created sub-folders + Calendar event. Replaces the
 * "Google" section that used to sit between Brief and Agency notes in the
 * main column — moving it here keeps the spine focused on the workflow
 * (brief → team → quote) and the rail focused on references.
 */
export default function FilesPanel({ booking }: Props) {
  const hasAnyFile = booking.drive_root_link || booking.drive_folder_ids || booking.calendar_event_id;
  if (!hasAnyFile) return null;

  const folderIds = booking.drive_folder_ids;

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Files
        </h3>
        {booking.drive_root_link && (
          <a
            href={booking.drive_root_link}
            target="_blank"
            rel="noreferrer"
            className="text-[10px]"
            style={{ color: PALETTE.accent }}
          >
            ↗ Open root
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {folderIds && FOLDER_KEYS.map((key) => {
          const folderId = folderIds[key];
          if (!folderId) return null;
          return (
            <a
              key={key}
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md text-[11px]"
              style={{
                padding: '4px 10px',
                background: PALETTE.bg,
                color: PALETTE.text,
                border: `1px solid ${PALETTE.border}`,
                textDecoration: 'none',
              }}
            >
              {FOLDER_LABELS[key]} ↗
            </a>
          );
        })}

        {booking.calendar_event_id && (
          <a
            href={`https://calendar.google.com/calendar/r/eventedit/${booking.calendar_event_id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md text-[11px]"
            style={{
              padding: '4px 10px',
              background: `${PALETTE.accent}14`,
              color: PALETTE.accent,
              border: `1px solid ${PALETTE.accent}44`,
              textDecoration: 'none',
            }}
          >
            Calendar event ↗
          </a>
        )}
      </div>
    </section>
  );
}
