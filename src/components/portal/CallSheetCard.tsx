import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import type { PortalCallSheet } from '@/lib/data/portal';

type Props = {
  sheet: PortalCallSheet;
};

export default function CallSheetCard({ sheet }: Props) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold" style={{ color: PALETTE.text }}>{sheet.title}</div>
          {sheet.bookingRef && (
            <div className="text-[10px] font-mono mt-0.5" style={{ color: PALETTE.muted }}>{sheet.bookingRef}</div>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
        >
          Upcoming shoot
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        {sheet.shootDateNotes && (
          <div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Date</div>
            <div className="mt-0.5" style={{ color: PALETTE.text }}>{sheet.shootDateNotes}</div>
          </div>
        )}
        {sheet.shootLocation && (
          <div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Location</div>
            <div className="mt-0.5" style={{ color: PALETTE.text }}>{sheet.shootLocation}</div>
          </div>
        )}
      </div>

      {sheet.team.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Team</div>
          <ul className="space-y-1.5">
            {sheet.team.map((member, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span style={{ color: PALETTE.text }}>{member.name}</span>
                  <span style={{ color: PALETTE.muted }}>·</span>
                  <span style={{ color: PALETTE.muted }}>{humanise(member.role)}</span>
                </div>
                {member.mobile && (
                  <a
                    href={`tel:${member.mobile}`}
                    className="font-mono text-[10px]"
                    style={{ color: PALETTE.accent }}
                  >
                    {member.mobile}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
