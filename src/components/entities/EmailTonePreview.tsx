'use client';

import { useState, useEffect } from 'react';
import { buildQuoteChaseEmail } from '@/lib/utils/comms-tone';
import { COMMUNICATION_STYLE_LABELS, PALETTE } from '@/lib/utils/constants';
import type { CommunicationStyle } from '@/lib/types/database';

type Props = {
  initialStyle: CommunicationStyle | null;
  clientName: string;
};

export default function EmailTonePreview({ initialStyle, clientName }: Props) {
  const [style, setStyle] = useState<CommunicationStyle | null>(initialStyle);
  const [open, setOpen] = useState(false);

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
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[10px]"
        style={{ color: PALETTE.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Preview · {styleLabel}</span>
      </button>

      {open && (
        <div
          className="rounded-md border p-2.5 mt-1.5"
          style={{
            background: PALETTE.bg,
            borderColor: PALETTE.border,
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: PALETTE.muted, marginBottom: 3, fontSize: 10 }}>
            Subject: <span style={{ color: PALETTE.text }}>{sample.subject}</span>
          </div>
          <div
            style={{
              color: PALETTE.text,
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10,
              lineHeight: 1.5,
              maxHeight: 140,
              overflowY: 'auto',
            }}
          >
            {sample.body}
          </div>
        </div>
      )}
    </div>
  );
}
