'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RegenerateQuoteV1Button from './RegenerateQuoteV1Button';
import type { QuoteVersion, FeeLine, FeeLineType, BookingTalent } from '@/lib/types/database';
import type { RatePrecedent } from '@/lib/data/quotes';
import { computeQuoteTotals, type ComputedFeeLine } from '@/lib/utils/fee-engine';
import { FEE_LINE_TYPE_LABELS, PALETTE, DEFAULT_ASF_RATE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import {
  createQuoteVersionAction,
  addFeeLineAction, removeFeeLineAction, updateFeeLineAction,
  getFeeLinesByVersionAction, generateQuoteFromTemplateAction,
} from '@/app/actions/quotes';

type Props = {
  bookingId: string;
  quoteVersions: QuoteVersion[];
  feeLines: FeeLine[]; // fee lines for the latest version (initial server render)
  bookingTalent?: BookingTalent[];
  ratePrecedents?: RatePrecedent[];
};

const LINE_TYPE_OPTIONS: FeeLineType[] = [
  'artist_fee', 'usage_licence', 'file_management', 'retouching',
  'crew_labour', 'crew_equipment', 'equipment_rental',
  'studio_hire', 'travel', 'catering', 'wardrobe', 'props',
  'casting', 'location_fee', 'permits', 'insurance',
  'post_production', 'overtime', 'other_expense',
];

// Artist / billable vs outgoing (crew + production costs)
const OUTGOING_TYPES = new Set<FeeLineType>([
  'crew_labour', 'crew_equipment', 'equipment_rental',
  'studio_hire', 'travel', 'catering', 'wardrobe', 'props',
  'casting', 'location_fee', 'permits', 'insurance',
]);

export default function QuoteBuilder({ bookingId, quoteVersions, feeLines: initialFeeLines, bookingTalent = [], ratePrecedents = [] }: Props) {
  const router = useRouter();
  const [showAddLine, setShowAddLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template generation state
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'photographer' | 'videographer' | null>(null);
  // Pre-fill shoot fee from first talent's confirmed day rate, fallback to template default
  const primaryTalentDayRate = bookingTalent[0]?.day_rate ?? null;
  // Detected discipline from the attached primary artist (for template auto-select)
  const primaryDiscipline = bookingTalent[0]?.talent?.discipline ?? null;
  const [shootFeeInput, setShootFeeInput] = useState<string>('');

  // Version navigation
  const latestVersion = quoteVersions[0] ?? null;
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(latestVersion?.id ?? null);
  const [feeLines, setFeeLines] = useState<FeeLine[]>(initialFeeLines);
  const [loadingVersion, setLoadingVersion] = useState(false);

  const selectedVersion = quoteVersions.find((v) => v.id === selectedVersionId) ?? latestVersion;
  const isLatestVersion = selectedVersionId === latestVersion?.id || selectedVersionId === null;

  const loadVersion = useCallback(async (versionId: string) => {
    setLoadingVersion(true);
    cancelEdit();
    setShowAddLine(false);
    const lines = await getFeeLinesByVersionAction(versionId);
    setFeeLines(lines);
    setLoadingVersion(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // When the server refreshes (new version created, line added), sync latest.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeeLines(initialFeeLines);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (latestVersion) setSelectedVersionId(latestVersion.id);
  }, [initialFeeLines, latestVersion]);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    description: string;
    quantity: string;
    unit_price: string;
  } | null>(null);

  // Compute totals with live preview when a row is being edited
  const previewLines = feeLines.map((l) => {
    if (l.id !== editingId || !editValues) return l;
    const qty = parseFloat(editValues.quantity) || l.quantity;
    const price = parseFloat(editValues.unit_price) || l.unit_price;
    return { ...l, quantity: qty, unit_price: price, subtotal: qty * price };
  });
  const totals = computeQuoteTotals(previewLines);

  // Split artist vs outgoings for the totals breakdown
  const artistLines = previewLines.filter((l) => !OUTGOING_TYPES.has(l.line_type));
  const outgoingLines = previewLines.filter((l) => OUTGOING_TYPES.has(l.line_type));
  const artistTotals = computeQuoteTotals(artistLines);
  const outgoingTotals = computeQuoteTotals(outgoingLines);

  function startEdit(line: FeeLine) {
    setEditingId(line.id);
    setEditValues({
      description: line.description,
      quantity: String(line.quantity),
      unit_price: String(line.unit_price),
    });
    setShowAddLine(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues(null);
  }

  async function commitEdit(line: FeeLine) {
    if (!editValues) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('description', editValues.description);
    fd.set('quantity', editValues.quantity);
    fd.set('unit_price', editValues.unit_price);
    fd.set('booking_id', bookingId);
    const result = await updateFeeLineAction(line.id, fd);
    if ('error' in result) {
      setError(result.error ?? 'Failed to save');
    } else {
      cancelEdit();
      router.refresh();
    }
    setBusy(false);
  }

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

  async function handleGenerateFromTemplate() {
    if (!selectedTemplate) return;
    setBusy(true);
    setError(null);
    const override = shootFeeInput ? parseFloat(shootFeeInput) : undefined;
    const result = await generateQuoteFromTemplateAction(bookingId, selectedTemplate, override);
    if ('error' in result) {
      setError(result.error ?? 'Failed');
    } else {
      setShowTemplatePanel(false);
      setSelectedTemplate(null);
      setShootFeeInput('');
      router.refresh();
    }
    setBusy(false);
  }

  function openTemplate(t: 'photographer' | 'videographer') {
    setSelectedTemplate(t);
    // Pre-fill shoot fee from talent rate (fallback to template default)
    const defaultFee = t === 'photographer' ? 4000 : 3000;
    setShootFeeInput(String(primaryTalentDayRate ?? defaultFee));
    setShowTemplatePanel(true);
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
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Quote
          </h3>
          {/* Version tabs */}
          {quoteVersions.length > 0 && (
            <div className="flex gap-1">
              {[...quoteVersions].reverse().map((v) => {
                const isSelected = v.id === selectedVersionId;
                return (
                  <button
                    key={v.id}
                    onClick={async () => {
                      setSelectedVersionId(v.id);
                      await loadVersion(v.id);
                    }}
                    disabled={loadingVersion}
                    className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50"
                    style={{
                      background: isSelected ? PALETTE.accent : `${PALETTE.accent}18`,
                      color: isSelected ? PALETTE.bg : PALETTE.accent,
                    }}
                  >
                    v{v.version}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions — only on latest version */}
        {isLatestVersion && (
          <div className="flex gap-2">
            {latestVersion && (
              <button
                onClick={() => { setShowAddLine(true); cancelEdit(); }}
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
        )}
        {!isLatestVersion && (
          <span className="text-[11px]" style={{ color: PALETTE.muted }}>
            Read-only — viewing v{selectedVersion?.version}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded px-3 py-1.5 text-xs" style={{ background: `${PALETTE.danger}22`, color: PALETTE.danger }}>
          {error}
        </div>
      )}

      {/* Template panel — shown when generating from template */}
      {showTemplatePanel && selectedTemplate && (
        <div className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: `${PALETTE.accent}44` }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize" style={{ color: PALETTE.text }}>
              {selectedTemplate} template
            </span>
            <button
              onClick={() => { setShowTemplatePanel(false); setSelectedTemplate(null); }}
              className="text-[11px]"
              style={{ color: PALETTE.muted }}
            >
              Cancel
            </button>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>
              Shoot fee ($)
              {primaryTalentDayRate && (
                <span className="ml-1 font-normal normal-case" style={{ color: PALETTE.accent }}>
                  · pre-filled from {bookingTalent[0] && 'talent_id' in bookingTalent[0] ? 'talent' : 'talent'} day rate
                </span>
              )}
            </label>
            <input
              type="number"
              step="50"
              min="0"
              value={shootFeeInput}
              onChange={(e) => setShootFeeInput(e.target.value)}
              className="w-40 rounded border px-2 py-1.5 text-sm"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </div>
          {ratePrecedents.length > 0 && (
            <div className="rounded border px-3 py-2 space-y-1" style={{ borderColor: PALETTE.border, background: `${PALETTE.accent}08` }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                Rate history for this artist
              </div>
              {ratePrecedents.map((p) => (
                <div key={p.bookingId} className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium" style={{ color: PALETTE.text }}>
                    {formatCurrency(p.dayRate)}
                  </span>
                  <span style={{ color: PALETTE.muted }}>
                    {p.bookingRef ?? p.bookingId.slice(0, 8)} · {p.tier}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShootFeeInput(String(p.dayRate))}
                    className="text-[10px] rounded px-1.5 py-0.5"
                    style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px]" style={{ color: PALETTE.muted }}>
            {selectedTemplate === 'photographer'
              ? 'Creates: shoot fee · digital operator ($600) · assistant ($600). Agency commission + crew fringes auto-computed.'
              : 'Creates: shoot fee · 1AC labour ($900) · 1AC kit ($400) · lighting tech ($750). Agency commission + crew fringes auto-computed.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleGenerateFromTemplate}
              disabled={busy}
              className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg }}
            >
              {busy ? 'Generating…' : 'Generate Quote'}
            </button>
            <button
              onClick={() => { setShowTemplatePanel(false); setSelectedTemplate(null); }}
              className="rounded px-3 py-1.5 text-xs"
              style={{ color: PALETTE.muted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!latestVersion && !showTemplatePanel && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: PALETTE.border }}>
          <p className="text-xs font-medium" style={{ color: PALETTE.text }}>Start this quote:</p>
          {/* One-click auto-generate when artist + discipline are known (legacy bookings) */}
          {(primaryDiscipline === 'photographer' || primaryDiscipline === 'videographer') && (
            <div className="rounded border p-3 space-y-2" style={{ borderColor: `${PALETTE.accent}44`, background: `${PALETTE.accent}08` }}>
              <p className="text-xs" style={{ color: PALETTE.accent }}>
                Primary artist is a {primaryDiscipline}. One-click generate or use a template:
              </p>
              <RegenerateQuoteV1Button
                bookingId={bookingId}
                discipline={primaryDiscipline}
                dayRate={bookingTalent[0]?.day_rate ?? bookingTalent[0]?.talent?.default_day_rate ?? null}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openTemplate('photographer')}
              disabled={busy}
              className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{
                background: primaryDiscipline === 'photographer' ? PALETTE.accent : `${PALETTE.accent}18`,
                color: primaryDiscipline === 'photographer' ? PALETTE.bg : PALETTE.accent,
                border: `1px solid ${PALETTE.accent}44`,
              }}
            >
              Photographer template
            </button>
            <button
              onClick={() => openTemplate('videographer')}
              disabled={busy}
              className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{
                background: primaryDiscipline === 'videographer' ? PALETTE.accent : `${PALETTE.accent}18`,
                color: primaryDiscipline === 'videographer' ? PALETTE.bg : PALETTE.accent,
                border: `1px solid ${PALETTE.accent}44`,
              }}
            >
              Videographer template
            </button>
            <button
              onClick={handleCreateVersion}
              disabled={busy}
              className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            >
              Blank quote
            </button>
          </div>
          <p className="text-[10px]" style={{ color: PALETTE.muted }}>
            Templates pre-fill standard crew & rates — you can edit every line after.
          </p>
        </div>
      )}

      {/* Add line form */}
      {showAddLine && latestVersion && isLatestVersion && (
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
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: PALETTE.border, opacity: loadingVersion ? 0.5 : 1, transition: 'opacity 0.15s' }}
        >
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
                const computed: ComputedFeeLine | undefined = totals.lines[i];
                const isEditing = editingId === line.id;
                const isOutgoing = OUTGOING_TYPES.has(line.line_type);

                if (isEditing && editValues && isLatestVersion) {
                  const previewQty = parseFloat(editValues.quantity) || line.quantity;
                  const previewPrice = parseFloat(editValues.unit_price) || line.unit_price;
                  const previewComputed = totals.lines[i];

                  return (
                    <tr key={line.id} className="border-t" style={{ borderColor: PALETTE.border, background: `${PALETTE.accent}08` }}>
                      <td className="px-3 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: isOutgoing ? `${PALETTE.warning}18` : `${PALETTE.accent}15`, color: isOutgoing ? PALETTE.warning : PALETTE.accent }}>
                          {FEE_LINE_TYPE_LABELS[line.line_type]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          autoFocus
                          value={editValues.description}
                          onChange={(e) => setEditValues((v) => v && { ...v, description: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(line); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-full rounded border px-2 py-1 text-xs"
                          style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number" step="0.5" min="0"
                          value={editValues.quantity}
                          onChange={(e) => setEditValues((v) => v && { ...v, quantity: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(line); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-16 rounded border px-2 py-1 text-xs text-right tabular-nums"
                          style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number" step="0.01" min="0"
                          value={editValues.unit_price}
                          onChange={(e) => setEditValues((v) => v && { ...v, unit_price: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(line); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-24 rounded border px-2 py-1 text-xs text-right tabular-nums"
                          style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: PALETTE.accent }}>{formatCurrency(previewQty * previewPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: PALETTE.muted }}>{formatCurrency(previewComputed?.asfAmount ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: PALETTE.muted }}>{formatCurrency(previewComputed?.gstAmount ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(previewComputed?.lineTotal ?? 0)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5 items-end">
                          <button onClick={() => commitEdit(line)} disabled={busy} className="text-[10px] font-medium hover:underline disabled:opacity-50" style={{ color: PALETTE.accent }}>Save</button>
                          <button onClick={cancelEdit} className="text-[10px] hover:underline" style={{ color: PALETTE.muted }}>Esc</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={line.id}
                    className={`border-t group ${isLatestVersion ? 'cursor-pointer hover:bg-white/5' : ''}`}
                    style={{ borderColor: PALETTE.border }}
                    onClick={isLatestVersion ? () => startEdit(line) : undefined}
                    title={isLatestVersion ? 'Click to edit' : undefined}
                  >
                    <td className="px-3 py-2">
                      <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: isOutgoing ? `${PALETTE.warning}18` : `${PALETTE.accent}15`, color: isOutgoing ? PALETTE.warning : PALETTE.accent }}>
                        {FEE_LINE_TYPE_LABELS[line.line_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span>{line.description}</span>
                      {isLatestVersion && <span className="ml-1.5 opacity-0 group-hover:opacity-100 text-[9px] transition-opacity" style={{ color: PALETTE.muted }}>edit</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.subtotal ?? line.subtotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.asfAmount ?? line.asf_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(computed?.gstAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(computed?.lineTotal ?? 0)}</td>
                    <td className="px-3 py-2">
                      {isLatestVersion && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveLine(line.id); }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] hover:underline transition-opacity"
                          style={{ color: PALETTE.danger }}
                          disabled={busy}
                        >
                          ×
                        </button>
                      )}
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
        <div className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          {/* Artist fees subtotal */}
          {artistLines.length > 0 && outgoingLines.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>Artist &amp; Licence Fees</div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <TotalField label="Subtotal" value={artistTotals.subtotal} />
                <TotalField label="ASF" value={artistTotals.totalAsf} />
                <TotalField label="GST" value={artistTotals.totalGst} />
                <TotalField label="Commission" value={artistTotals.totalCommission} muted />
              </div>
            </div>
          )}

          {/* Outgoings subtotal */}
          {outgoingLines.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: PALETTE.warning }}>
                Outgoings (crew &amp; production)
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <TotalField label="Subtotal" value={outgoingTotals.subtotal} warn />
                <TotalField label="ASF" value={outgoingTotals.totalAsf} warn />
                <TotalField label="GST" value={outgoingTotals.totalGst} warn />
                <TotalField label="Super (charged)" value={outgoingTotals.totalSuper} warn />
              </div>
            </div>
          )}

          {/* Grand total */}
          <div className="flex items-baseline justify-between border-t pt-3" style={{ borderColor: PALETTE.border }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Grand Total</span>
            <span
              className="text-lg font-bold tabular-nums transition-colors"
              style={{ color: editingId ? PALETTE.accent : PALETTE.text }}
            >
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>

          {totals.totalCommission > 0 && (
            <div className="flex items-baseline justify-between text-xs" style={{ color: PALETTE.muted }}>
              <span>Agency commission (retained at remittance)</span>
              <span className="tabular-nums">{formatCurrency(totals.totalCommission)} + {formatCurrency(totals.totalCommissionGst)} GST</span>
            </div>
          )}
        </div>
      )}

      {/* Version notes */}
      {selectedVersion?.notes && (
        <div className="text-[11px] px-1" style={{ color: PALETTE.muted }}>
          v{selectedVersion.version} notes: {selectedVersion.notes}
        </div>
      )}
    </section>
  );
}

function TotalField({ label, value, muted, warn }: { label: string; value: number; muted?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 tabular-nums" style={{ color: warn ? PALETTE.warning : muted ? PALETTE.muted : PALETTE.text }}>
        {formatCurrency(value)}
      </div>
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
            autoFocus
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
            name="quantity" type="number" step="0.5" min="0" defaultValue="1"
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Unit Price ($)</label>
          <input
            name="unit_price" type="number" step="0.01" min="0" required
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>
            ASF Rate (default {(DEFAULT_ASF_RATE * 100).toFixed(0)}%)
          </label>
          <input
            name="asf_rate" type="number" step="0.01" min="0" max="1"
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
        <button type="submit" disabled={busy} className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
          Add Line
        </button>
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs font-medium" style={{ color: PALETTE.muted }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
