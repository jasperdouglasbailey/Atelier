import type { BookingState } from '@/lib/types/database';
import {
  STAGE_GROUPS, stageOf, stageIndex, type BookingStageGroup,
} from '@/lib/utils/booking-stages';
import { PALETTE } from '@/lib/utils/constants';

// Display labels that match the industry vernacular in the mockup
const PILL_LABELS: Record<BookingStageGroup, string> = {
  brief:      'Enquiry',
  quote:      'Quote',
  production: 'Pre-Production',
  delivery:   'Post',
  closed:     'Wrap',
};

type Props = { state: BookingState };

export default function StageStepper({ state }: Props) {
  const currentGroup = stageOf(state);
  const currentIndex = stageIndex(currentGroup);
  const isClosedExit = currentGroup === 'closed';

  return (
    <div className="flex items-center gap-0">
      {STAGE_GROUPS.map((group, i) => {
        const isCurrent = group === currentGroup;
        const isPast = !isClosedExit && i < currentIndex;
        const num = String(i + 1).padStart(2, '0');

        let pillBg: string;
        let pillText: string;
        let numBg: string;
        let numText: string;

        if (isCurrent) {
          pillBg = PALETTE.text;
          pillText = PALETTE.bg;
          numBg = PALETTE.bg;
          numText = PALETTE.text;
        } else if (isPast) {
          pillBg = 'transparent';
          pillText = PALETTE.muted;
          numBg = 'transparent';
          numText = PALETTE.muted;
        } else {
          pillBg = 'transparent';
          pillText = PALETTE.border;
          numBg = 'transparent';
          numText = PALETTE.border;
        }

        return (
          <div key={group} className="flex items-center">
            {/* Pill */}
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                background: pillBg,
                border: isCurrent ? 'none' : `1px solid ${isPast ? PALETTE.border : PALETTE.border}`,
              }}
            >
              <span
                className="text-[9px] font-semibold tabular-nums"
                style={{ color: isCurrent ? pillText : numText, letterSpacing: '0.05em' }}
              >
                {isPast ? '✓' : num}
              </span>
              <span
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: pillText }}
              >
                {PILL_LABELS[group]}
              </span>
            </div>

            {/* Arrow connector */}
            {i < STAGE_GROUPS.length - 1 && (
              <span
                className="mx-1 text-[10px] select-none"
                style={{ color: PALETTE.border }}
              >
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { stageOf };
export type { BookingStageGroup };
