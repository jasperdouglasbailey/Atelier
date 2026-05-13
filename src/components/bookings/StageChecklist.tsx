import type { StageChecklist as ChecklistData } from '@/lib/utils/booking-stages';
import { PALETTE } from '@/lib/utils/constants';

type Props = { checklist: ChecklistData };

const STATUS_STYLES: Record<ChecklistData['items'][number]['status'], { bg: string; fg: string; symbol: string; label: string }> = {
  done:     { bg: PALETTE.ok,   fg: '#fff',    symbol: '✓', label: 'Done' },
  pending:  { bg: PALETTE.warn, fg: '#fff',    symbol: '!', label: 'Needed' },
  optional: { bg: PALETTE.warn, fg: '#fff',    symbol: '·', label: 'Optional' },
  blocked:  { bg: PALETTE.muted, fg: '#fff',   symbol: '×', label: 'Blocked' },
};

/**
 * "What's left" panel rendered beneath the StageStepper. Shows a one-line
 * summary, a checklist of stage-specific micro-tasks, and the single big
 * primary CTA that drives the next state transition.
 *
 * The CTA is intentionally just a label here — the booking detail page
 * wires the actual transition button (which already knows about prompts,
 * meta capture, etc.) so this component stays presentation-only.
 */
export default function StageChecklist({ checklist }: Props) {
  const { summary, items, nextAction } = checklist;
  return (
    <div className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="micro-label mb-1">What’s left</div>
          <p className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{summary}</p>
        </div>
        {nextAction && (
          <div className="flex-none">
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium"
              style={
                nextAction.intent === 'primary'
                  ? { background: PALETTE.accent, color: PALETTE.bg }
                  : nextAction.intent === 'danger'
                  ? { background: PALETTE.danger, color: '#fff' }
                  : { background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }
              }
              title={
                nextAction.intent === 'wait'
                  ? 'Nothing to do right now — waiting on the next signal'
                  : 'Use the state transition buttons to advance the booking'
              }
            >
              {nextAction.intent === 'wait' && <span className="mr-1.5 opacity-60">◷</span>}
              {nextAction.label}
            </span>
          </div>
        )}
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {items.map((item, idx) => {
          const style = STATUS_STYLES[item.status];
          return (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <span
                className="mt-0.5 inline-flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: style.bg, color: style.fg }}
                title={style.label}
              >
                {style.symbol}
              </span>
              <span style={{ color: item.status === 'done' ? PALETTE.muted : PALETTE.text }}>
                {item.label}
                {item.hint && (
                  <span className="ml-1.5 text-[10px]" style={{ color: PALETTE.muted }}>
                    — {item.hint}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
