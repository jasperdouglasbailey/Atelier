'use client';

/**
 * Live preview of how an automated email reads in the currently-selected
 * communication style. Drops in next to the "Email Tone" dropdown on the
 * client edit form. Reuses the same buildQuoteChaseEmail helper that the
 * cron uses, so what you see here is exactly what gets sent.
 *
 * Defaults to a Day 7 quote-chase example because that's the most
 * frequently-fired automated email and it's a good demonstration of all
 * three tones (it's a longer body than Day 3 / Day 21).
 */

import { useState, useEffect } from 'react';
import { buildQuoteChaseEmail } from '@/lib/utils/comms-tone';
import { COMMUNICATION_STYLE_LABELS, PALETTE } from '@/lib/utils/constants';
import type { CommunicationStyle } from '@/lib/types/database';

type Props = {
  /** Initial style — pre-set by the parent form. */
  initialStyle: CommunicationStyle | null;
  clientName: string;
};

export default function EmailTonePreview({ initialStyle, clientName }: Props) {
  const [style, setStyle] = useState<CommunicationStyle | null>(initialStyle);

  // Watch the dropdown: any change to the <select name="communication_style">
  // sibling reflects here. Bound by querying for it on mount.
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>('select[name="communication_style"]');
    if (!select) return;
    function handle() {
      const v = select?.value;
      setStyle(v ? (v as CommunicationStyle) : null);
    }
    select.addEventListener('change', handle);
    return () => { select.removeEventListener('change', handle); };
  }, []);

  const sample = buildQuoteChaseEmail({
    style,
    dayMark: 7,
    bookingRef: 'BOOK-0042',
    bookingTitle: 'Resort 26',
    clientName: clientName || 'Sam',
  });

  const styleLabel = style ? COMMUNICATION_STYLE_LABELS[style] : 'Casual (default)';

  return (
    <div
      className="rounded-md border p-3 mt-2"
      style={{
        background: PALETTE.bg,
        borderColor: PALETTE.border,
        fontSize: 11,
        lineHeight: 1.5,
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          Preview · day-7 quote chase
        </span>
        <span className="text-[10px] font-medium" style={{ color: PALETTE.accent }}>
          {styleLabel}
        </span>
      </div>
      <div style={{ color: PALETTE.muted, marginBottom: 4, fontSize: 10 }}>
        Subject: <span style={{ color: PALETTE.text }}>{sample.subject}</span>
      </div>
      <div
        style={{
          color: PALETTE.text,
          whiteSpace: 'pre-wrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10.5,
          lineHeight: 1.55,
        }}
      >
        {sample.body}
      </div>
    </div>
  );
}
