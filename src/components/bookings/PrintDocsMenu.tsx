'use client';

import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';

type Props = { bookingId: string };

type DocRow = {
  label: string;
  printHref: string;
  pdfHref: string;
  pdfTitle: string;
};

export default function PrintDocsMenu({ bookingId }: Props) {
  const docs: DocRow[] = [
    {
      label: 'Quote',
      printHref: `/print/bookings/${bookingId}/quote`,
      pdfHref: `/api/print/quote/${bookingId}`,
      pdfTitle: 'Download quote as PDF',
    },
    {
      label: 'Invoice',
      printHref: `/print/bookings/${bookingId}/invoice`,
      pdfHref: `/api/print/invoice/${bookingId}`,
      pdfTitle: 'Download invoice as PDF',
    },
    {
      label: 'Confirmation',
      printHref: `/print/bookings/${bookingId}/confirmation`,
      pdfHref: `/api/print/confirmation/${bookingId}`,
      pdfTitle: 'Download booking confirmation as PDF',
    },
    {
      label: 'Accounting statement',
      printHref: `/print/bookings/${bookingId}/accounting`,
      pdfHref: `/api/print/accounting/${bookingId}`,
      pdfTitle: 'Download job accounting statement (full GST + cash-flow reconciliation) as PDF',
    },
  ];

  return (
    <details className="relative">
      <summary
        className="rounded px-2 py-0.5 text-[11px] cursor-pointer select-none list-none"
        style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
      >
        Print &amp; PDFs ▾
      </summary>
      <div
        className="absolute left-0 mt-1 rounded-md border shadow-lg z-20 py-1"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border, minWidth: 240 }}
      >
        {docs.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]">
            <span style={{ color: PALETTE.text, fontWeight: 500 }}>{d.label}</span>
            <span className="flex items-center gap-2">
              <Link
                href={d.printHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: PALETTE.muted }}
                className="hover:underline"
              >
                Print
              </Link>
              <span style={{ color: PALETTE.border }}>·</span>
              <a
                href={d.pdfHref}
                download
                style={{ color: PALETTE.accent }}
                className="hover:underline"
                title={d.pdfTitle}
              >
                PDF ↓
              </a>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
