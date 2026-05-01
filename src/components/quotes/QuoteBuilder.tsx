'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuoteVersion, FeeLine, FeeLineType } from '@/lib/types/database';
import { computeQuoteTotals, type ComputedFeeLine } from '@/lib/utils/fee-engine';
import {
  FEE_LINE_TYPE_LABELS, PALETTE,
  DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE,
  SUPER_RATE_CHARGED, SUPER_RATE_PAID,
} from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import {
  createQuoteVersionAction,
  addFeeLineAction, removeFeeLineAction,
} from '@/app/actions/quotes';

type Props = {
  bookingId: string;
  quoteVersions: QuoteVersion[];
  feeLines: FeeLine[];
};

const LINE_TYPE_OPTIONS: FeeLineType[] = [
  'artist_fee', 'usage_licence', 'file_management', 'retouching',
  'crew_labour', 'crew_equipment', 'equipment_rental',
  'studio_hire', 'travel', 'catering', 'wardrobe', 'props',
  'casting', 'location_fee', 'permits', 'insurance',
  'post_production', 'overtime', 'other_expense',
];

export default function QuoteBuilder({ bookingId, quoteVersions, feeLines }: Props) {
  const router = useRouter();
  const [showAddLine, setShowAddLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestVersion = quoteVersions[0] ?? null;
  const totals = computeQuoteTotals(feeLines);

  async function handleCreateVersion() {
    setBusy(true);
    setError(null);
    const result = await createQuoteVersionAction(bookingId);
    if ('error' in result) {
      setError(result.error ?? 'Failed');
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  async function handleAddLine(formData: FormData) {
    setBusy(true);
    setError(null);
    const result = await addFeeLineAction(formData);
    if ('error' in result) {
      setError(result.error ?? 'Failed');
    } else {
      setShowAddLine(false);
      router.refresh();
    }
    setBusy(false);
  }

  async function handleRemoveLine(lineId: string) {
    if (!confirm('Remove this fee line?')) return;
    setBusy(true);
    const result = await removeFeeLineAction(lineId, bookingId);
    if ('error' in result) setError(result.error ?? 'Failed');
    else router.refresh();
    setBusy(false);
  }

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Quote {latestVersion ? `v${latestVersion.version}` : ''}
        </h3>
        <div className="flex gap-2">
          {latestVersion && (
            <button
              onClick={() => setShowAddLine(true)}
              disabled={busy}
              className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg }}
            >
              + Add Line
            </button>
          )}
          <button
            onClick={handleCreateVersion}
            disabled={busy}
            className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
            style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
          >
            {latestVersion ? 'New Version' : 'Create Quote'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded px-3 py-1.5 text-xs" style={{ background: `${PALETTE.danger}22`, color: PALETTE.danger }}>
          {error}
        </div>
      )}

      {!latestVersion && (
        <p className="text-xs" style={{ color: PALETTE.muted }}>
          No quote yet. Create one to start adding fee lines.
        </p>
      )}

      {/* Add line form */}
      {showAddLine && latestVersion && (
        <AddLineForm
          quoteVersionId={latestVersion.id}
          bookingId={bookingId}
          onSubmit={handleAddLine}
          onCancel={() => setShowAddLine(false)}
          busy={busy}
        />
      )}

      {/* Fee lines table */}
      {feeLines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: PALETTE.border }}>
          <table className="w-full text-xs" style={{ color: PALETTE.text }}>
            <thead>
              <tr style={{ background: PALETTE.surface }}>
                <th className="px-3 py-2 text-left font-medium" style={{ color: PALETTE.muted }}>Type</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: PALETTE.muted }}>Description</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Qty</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Unit $</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Subtotal</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>ASF</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>GST</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Line Total</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {feeLines.map((line, i) => {
                const computed = totals.lines[i];
                return (
                  <tr key={line.id} className="border-t" style={{ borderColor: PALETTE.border }}>
                    <td className="px-3 py-2">
                      <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${PALETTE.accent}15`, color: PALETTE.accent }}>
                        {FEE_LINE_TYPE_LABELS[line.line_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.subtotal ?? line.subtotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.asfAmount ?? line.asf_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.gstAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(computed?.lineTotal ?? 0)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemoveLine(line.id)}
                        className="text-[10px] hover:underline"
                        style={{ color: PALETTE.danger }}
                        disabled={busy}
                      >
                        x
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      {feeLines.length > 0 && (
        <div className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <TotalField label="Subtotal" value={totals.subtotal} />
            <TotalField label="ASF" value={totals.totalAsf} />
            <TotalField label="GST" value={totals.totalGst} />
            <TotalField label="Super (client)" value={totals.totalSuper} />
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3" style={{ borderColor: PALETTE.border }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Grand Total</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: PALETTE.text }}>
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
          {totals.totalCommission > 0 && (
            <div className="mt-2 flex items-baseline justify-between text-xs" style={{ color: PALETTE.muted }}>
              <span>Agency commission (retained from artist payments)</span>
              <span className="tabular-nums">{formatCurrency(totals.totalCommission)} + {formatCurrency(totals.totalCommissionGst)} GST</span>
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      {quoteVersions.length > 1 && (
        <div className="text-[10px]" style={{ color: PALETTE.muted }}>
          {quoteVersions.length} versions — viewing latest (v{latestVersion?.version})
        </div>
      )}
    </section>
  );
}

function TotalField({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 tabular-nums" style={{ color: PALETTE.text }}>{formatCurrency(value)}</div>
    </div>
  );
}

// ============================================================
// Add line form (inline)
// ============================================================

function AddLineForm({
  quoteVersionId, bookingId, onSubmit, onCancel, busy,
}: {
  quoteVersionId: string;
  bookingId: string;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [lineType, setLineType] = useState<FeeLineType>('artist_fee');

  return (
    <form
      action={onSubmit}
      className="rounded-lg border p-3 space-y-2"
      style={{ background: PALETTE.surface, borderColor: PALETTE.accent + '44' }}
    >
      <input type="hidden" name="quote_version_id" value={quoteVersionId} />
      <input type="hidden" name="booking_id" value={bookingId} />

      <div className="grid gap-2 sm:grid-cols-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Type</label>
          <select
            name="line_type"
            value={lineType}
            onChange={(e) => setLineType(e.target.value as FeeLineType)}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            {LINE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{FEE_LINE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Description</label>
          <input
            name="description"
            required
            placeholder="e.g. Oliver AJE — full day"
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Quantity</label>
          <input
            name="quantity"
            type="number"
            step="0.5"
            min="0"
            defaultValue="1"
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Unit Price ($)</label>
          <input
            name="unit_price"
            type="number"
            step="0.01"
            min="0"
            required
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>
            ASF Rate (default {(DEFAULT_ASF_RATE * 100).toFixed(0)}%)
          </label>
          <input
            name="asf_rate"
            type="number"
            step="0.01"
            min="0"
            max="1"
            placeholder={String(DEFAULT_ASF_RATE)}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Notes</label>
        <input
          name="notes"
          className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
          style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          Add Line
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{ color: PALETTE.muted }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
