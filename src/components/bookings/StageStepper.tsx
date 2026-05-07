import type { BookingState } from '@/lib/types/database';
import {
  STAGE_GROUPS, STAGE_GROUP_LABELS, STAGE_GROUP_BLURBS,
  stageOf, stageIndex, type BookingStageGroup,
} from '@/lib/utils/booking-stages';
import { BOOKING_STATE_LABELS, PALETTE } from '@/lib/utils/constants';

type Props = { state: BookingState };

/**
 * Five-pip stage stepper rendered at the top of the booking detail page.
 *
 *   [ Brief ]──[ Quote ]──[ Production ]──[ Delivery ]──[ Closed ]
 *                ●  Quote drafted
 *
 * Past groups are filled in the accent colour, the current group is filled
 * and labelled with the fine state, future groups are outlined-only, and
 * "Closed" is greyed unless the booking is actually released or cancelled.
 */
export default function StageStepper({ state }: Props) {
  const currentGroup = stageOf(state);
  const currentIndex = stageIndex(currentGroup);
  const isClosedExit = currentGroup === 'closed';

  return (
    <div className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-stretch gap-1.5 sm:gap-2">
        {STAGE_GROUPS.map((group, i) => {
          const isCurrent = group === currentGroup;
          const isPast = !isClosedExit && i < currentIndex;
          const isClosedLane = group === 'closed';
          const isDimmedClosed = isClosedLane && !isClosedExit;

          // Visual style per state
          let bg: string;
          let fg: string;
          let borderColor: string;
          if (isCurrent) {
            bg = isClosedExit ? `${PALETTE.danger}22` : `${PALETTE.accent}22`;
            fg = isClosedExit ? PALETTE.danger : PALETTE.accent;
            borderColor = isClosedExit ? PALETTE.danger : PALETTE.accent;
          } else if (isPast) {
            bg = `${PALETTE.success}18`;
            fg = PALETTE.success;
            borderColor = `${PALETTE.success}66`;
          } else if (isDimmedClosed) {
            bg = 'transparent';
            fg = PALETTE.muted;
            borderColor = PALETTE.border;
          } else {
            bg = 'transparent';
            fg = PALETTE.muted;
            borderColor = PALETTE.border;
          }

          return (
            <div
              key={group}
              className="flex-1 rounded-md border px-2 py-1.5 sm:px-3 sm:py-2"
              style={{ background: bg, borderColor, color: fg, opacity: isDimmedClosed ? 0.4 : 1 }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    background: isCurrent || isPast ? fg : 'transparent',
                    color: isCurrent || isPast ? PALETTE.bg : fg,
                    border: isCurrent || isPast ? 'none' : `1px solid ${fg}`,
                  }}
                >
                  {isPast ? '✓' : i + 1}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {STAGE_GROUP_LABELS[group]}
                </span>
              </div>
              {isCurrent ? (
                <div className="mt-1 text-[10px] font-medium" style={{ color: fg }}>
                  {BOOKING_STATE_LABELS[state]}
                </div>
              ) : (
                <div className="mt-1 text-[10px] hidden sm:block" style={{ color: PALETTE.muted }}>
                  {STAGE_GROUP_BLURBS[group]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { stageOf };
export type { BookingStageGroup };
