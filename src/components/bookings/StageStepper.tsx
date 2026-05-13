import type { BookingState } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';

// 6 display stages for the stepper — maps over the 16 internal states.
// The internal state machine is unchanged; this is presentation only.
type DisplayStage = 'enquiry' | 'quote' | 'preProduction' | 'shoot' | 'post' | 'wrap';

const DISPLAY_STAGES: DisplayStage[] = [
  'enquiry', 'quote', 'preProduction', 'shoot', 'post', 'wrap',
];

const DISPLAY_LABELS: Record<DisplayStage, string> = {
  enquiry:       'Enquiry',
  quote:         'Quote',
  preProduction: 'Pre-Production',
  shoot:         'Shoot',
  post:          'Post',
  wrap:          'Wrap',
};

const STATE_TO_DISPLAY: Record<BookingState, DisplayStage> = {
  brief_received:      'enquiry',
  brief_parsed:        'enquiry',
  quote_drafted:       'quote',
  quote_sent:          'quote',
  artists_crew_held:   'quote',
  quote_confirmed:     'quote',
  pre_production:      'preProduction',
  shoot_live:          'shoot',
  morning_after_check: 'shoot',
  post_production:     'post',
  final_delivery:      'post',
  invoice_issued:      'post',
  paid:                'post',
  released:            'wrap',
  cancelled:           'wrap',
  written_off:         'wrap',
};

type Props = { state: BookingState };

export default function StageStepper({ state }: Props) {
  const currentDisplay = STATE_TO_DISPLAY[state];
  const currentIndex = DISPLAY_STAGES.indexOf(currentDisplay);
  const isTerminal = state === 'released' || state === 'cancelled' || state === 'written_off';

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {DISPLAY_STAGES.map((stage, i) => {
        const isCurrent = stage === currentDisplay;
        const isPast = !isTerminal && i < currentIndex;

        let pillBg: string;
        let pillText: string;
        let pillBorder: string;
        let showCheck: boolean;

        if (isCurrent) {
          pillBg = PALETTE.text;
          pillText = PALETTE.bg;
          pillBorder = `1px solid ${PALETTE.text}`;
          showCheck = false;
        } else if (isPast) {
          pillBg = 'transparent';
          pillText = PALETTE.muted;
          pillBorder = `1px solid ${PALETTE.muted}`;
          showCheck = true;
        } else {
          pillBg = 'transparent';
          pillText = PALETTE.muted;
          pillBorder = `1px dashed ${PALETTE.border}`;
          showCheck = false;
        }

        return (
          <div key={stage} className="flex items-center">
            <div
              className="flex items-center gap-1.5 px-3 py-1"
              style={{
                background: pillBg,
                border: pillBorder,
                borderRadius: 20,
              }}
            >
              {showCheck && (
                <span
                  style={{
                    fontSize: 9,
                    color: PALETTE.muted,
                    letterSpacing: '0.05em',
                  }}
                >
                  ✓
                </span>
              )}
              <span
                className="uppercase"
                style={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : 400,
                  letterSpacing: '0.06em',
                  color: pillText,
                  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                }}
              >
                {DISPLAY_LABELS[stage]}
              </span>
            </div>

            {i < DISPLAY_STAGES.length - 1 && (
              <span
                className="mx-1 select-none"
                style={{ fontSize: 10, color: PALETTE.border }}
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

// Re-export stageOf for callers that imported it from here
export { stageOf } from '@/lib/utils/booking-stages';
export type { BookingStageGroup } from '@/lib/utils/booking-stages';
