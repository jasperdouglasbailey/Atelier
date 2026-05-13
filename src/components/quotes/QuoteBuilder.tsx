'use client';

import { useState, useEffect, useCallback, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import RegenerateQuoteV1Button from './RegenerateQuoteV1Button';
import type { QuoteVersion, FeeLine, FeeLineType, BookingTalent, BookingCrew } from '@/lib/types/database';
import type { RatePrecedent } from '@/lib/data/quotes';
import { computeQuoteTotals, computeAgencyMargin, computeGstPassthrough, type ComputedFeeLine } from '@/lib/utils/fee-engine';
import { FEE_LINE_TYPE_LABELS, PALETTE, DEFAULT_ASF_RATE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import {
  createQuoteVersionAction,
  addFeeLineAction, removeFeeLineAction, updateFeeLineAction,
  getFeeLinesByVersionAction, generateQuoteFromTemplateAction,
  reorderFeeLinesAction,
} from '@/app/actions/quotes';

type Props = {
  bookingId: string;
  quoteVersions: QuoteVersion[];
  feeLines: FeeLine[]; // fee lines for the latest version (initial server render)
  bookingTalent?: BookingTalent[];
  bookingCrew?: BookingCrew[];
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

export default function QuoteBuilder({ bookingId, quoteVersions, feeLines: initialFeeLines, bookingTalent = [], bookingCrew = [], ratePrecedents = [] }: Props) {
  const router = useRouter();
  const [showAddLine, setShowAddLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template generation state
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'photographer' | 'videographer' | 'stylist' | 'hmu' | null>(null);
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
  }, []); // stable deps only — setState setters + server action import

  useEffect(() => {
    // When the server refreshes (new version created, line added), sync latest.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeeLines(initialFeeLines);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (latestVersion) setSelectedVersionId(latestVersion.id);
  }, [initialFeeLines, latestVersion]);

  // Inline editing state. asf_rate is editable here so Jasper can flip ASF
  // off on equipment/pass-through lines without leaving the quote table.
  // line_type is also editable so the type can be corrected without re-adding.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    line_type: FeeLineType;
    description: string;
    quantity: string;
    unit_price: string;
    asf_rate: string; // stored as percent string, e.g. '15' or '0'
  } | null>(null);

  // Totals breakdown — collapsed by default so the quote totals panel reads
  // as just "Grand Total" at a glance. Click to expand the full GST
  // passthrough + agency margin internals.
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);

  // Drag-to-reorder state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [, startReorderTransition] = useTransition();

  // Compute totals with live preview when a row is being edited
  const previewLines = feeLines.map((l) => {
    if (l.id !== editingId || !editValues) return l;
    const qty = parseFloat(editValues.quantity) || l.quantity;
    const price = parseFloat(editValues.unit_price) || l.unit_price;
    const asfRatePct = parseFloat(editValues.asf_rate);
    const asfRate = Number.isFinite(asfRatePct) ? asfRatePct / 100 : (l.asf_rate ?? DEFAULT_ASF_RATE);
    return { ...l, quantity: qty, unit_price: price, subtotal: qty * price, asf_rate: asfRate };
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
      line_type: line.line_type,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: String(line.unit_price),
      asf_rate: String(Math.round((line.asf_rate ?? DEFAULT_ASF_RATE) * 100)),
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
    fd.set('line_type', editValues.line_type);
    fd.set('description', editValues.description);
    fd.set('quantity', editValues.quantity);
    fd.set('unit_price', editValues.unit_price);
    fd.set('booking_id', bookingId);
    const asfPct = parseFloat(editValues.asf_rate);
    if (Number.isFinite(asfPct)) {
      fd.set('asf_rate', String(asfPct / 100));
    }
    // Optimistic: update local state immediately so the UI snaps without waiting for router.refresh()
    const newQty = parseFloat(editValues.quantity) || line.quantity;
    const newPrice = parseFloat(editValues.unit_price) || line.unit_price;
    const newAsfRate = Number.isFinite(asfPct) ? asfPct / 100 : (line.asf_rate ?? DEFAULT_ASF_RATE);
    const optimistic: FeeLine = {
      ...line,
      line_type: editValues.line_type,
      description: editValues.description,
      quantity: newQty,
      unit_price: newPrice,
      subtotal: Math.round(newQty * newPrice * 100) / 100,
      asf_rate: newAsfRate,
      asf_amount: Math.round(newQty * newPrice * newAsfRate * 100) / 100,
    };
    setFeeLines((prev) => prev.map((l) => l.id === line.id ? optimistic : l));
    cancelEdit();

    const result = await updateFeeLineAction(line.id, fd);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      // Revert on error
      setFeeLines((prev) => prev.map((l) => l.id === line.id ? line : l));
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

  function openTemplate(t: 'photographer' | 'videographer' | 'stylist' | 'hmu') {
    setSelectedTemplate(t);
    // Pre-fill shoot fee from talent rate (fallback to template default)
    const defaultFees: Record<typeof t, number> = {
      photographer: 4000, videographer: 3000, stylist: 1800, hmu: 1400,
    };
    setShootFeeInput(String(primaryTalentDayRate ?? defaultFees[t]));
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
    // Optimistic: remove from local state immediately
    const snapshot = feeLines;
    setFeeLines((prev) => prev.filter((l) => l.id !== lineId));
    const result = await removeFeeLineAction(lineId, bookingId);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      setFeeLines(snapshot); // revert
    }
  }

  function handleReorder(fromIdx: number | null, toIdx: number) {
    if (fromIdx === null || fromIdx === toIdx) return;
    const newLines = [...feeLines];
    const [moved] = newLines.splice(fromIdx, 1);
    newLines.splice(toIdx, 0, moved);
    setFeeLines(newLines);
    setDraggingIdx(null);
    setDropIdx(null);
    const orderedIds = newLines.map((l) => l.id);
    startReorderTransition(async () => {
      await reorderFeeLinesAction(orderedIds, bookingId);
    });
  }

  return (
    <section className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="section-title">
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
            {selectedTemplate === 'photographer' && 'Creates: shoot fee · digital operator ($600) · assistant ($600). Agency commission + crew fringes auto-computed.'}
            {selectedTemplate === 'videographer' && 'Creates: shoot fee · 1AC labour ($900) · 1AC kit ($400) · lighting tech ($750). Agency commission + crew fringes auto-computed.'}
            {selectedTemplate === 'stylist' && 'Creates: shoot day rate · pre-pro days · kit fee · wardrobe pull · travel. Lines marked TBD start at $0 — fill them in after.'}
            {selectedTemplate === 'hmu' && 'Creates: shoot day rate · pre-pro / test day · kit fee · travel. Lines marked TBD start at $0 — fill them in after.'}
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

      {!latestVersion && !showTemplatePanel && (() => {
        // Map artist discipline → suggested template
        const disciplineToTemplate: Record<string, 'photographer' | 'videographer' | 'stylist' | 'hmu' | null> = {
          photographer: 'photographer',
          videographer: 'videographer',
          wardrobe_stylist: 'stylist',
          hair: 'hmu',
          makeup: 'hmu',
          hair_and_makeup: 'hmu',
          manicurist: 'hmu',
        };
        const suggested = primaryDiscipline ? disciplineToTemplate[primaryDiscipline] ?? null : null;
        const templateLabel = (t: 'photographer' | 'videographer' | 'stylist' | 'hmu') => ({
          photographer: 'Photographer template',
          videographer: 'Videographer template',
          stylist: 'Stylist template',
          hmu: 'Hair & Makeup template',
        }[t]);
        return (
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
            {(['photographer', 'videographer', 'stylist', 'hmu'] as const).map((t) => {
              const isSuggested = suggested === t;
              return (
                <button
                  key={t}
                  onClick={() => openTemplate(t)}
                  disabled={busy}
                  className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
                  style={{
                    background: isSuggested ? PALETTE.accent : `${PALETTE.accent}18`,
                    color: isSuggested ? PALETTE.bg : PALETTE.accent,
                    border: `1px solid ${PALETTE.accent}44`,
                  }}
                >
                  {templateLabel(t)}
                </button>
              );
            })}
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
        );
      })()}

      {/* Fee lines table */}
      {feeLines.length > 0 && (
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: PALETTE.border, opacity: loadingVersion ? 0.5 : 1, transition: 'opacity 0.15s' }}
        >
          <table className="w-full text-xs" style={{ color: PALETTE.text, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20px' }} /> {/* Drag handle */}
              <col style={{ width: '13%' }} />  {/* Type */}
              <col />                            {/* Description — takes remaining space */}
              <col style={{ width: '52px' }} /> {/* Qty */}
              <col style={{ width: '80px' }} /> {/* Unit $ */}
              <col style={{ width: '80px' }} /> {/* Subtotal */}
              <col style={{ width: '88px' }} /> {/* ASF */}
              <col style={{ width: '72px' }} /> {/* GST */}
              <col style={{ width: '84px' }} /> {/* Line Total */}
              <col style={{ width: '28px' }} /> {/* Delete */}
            </colgroup>
            <thead>
              <tr style={{ background: PALETTE.surface }}>
                <th className="px-1 py-2"></th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: PALETTE.muted }}>Type</th>
                <th className="px-3 py-2 text-left font-medium" style={{ color: PALETTE.muted }}>Description</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Qty</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Unit $</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Subtotal</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>ASF</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>GST</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }}>Line Total</th>
                <th className="px-3 py-2"></th>
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
                      <td className="px-1 py-2" />
                      <td className="px-3 py-1.5">
                        <select
                          value={editValues.line_type}
                          onChange={(e) => setEditValues((v) => v && { ...v, line_type: e.target.value as FeeLineType })}
                          className="w-full rounded border px-1.5 py-1 text-[10px]"
                          style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                        >
                          {LINE_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>{FEE_LINE_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
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
                      <td className="px-3 py-1.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number" step="1" min="0" max="100"
                            value={editValues.asf_rate}
                            onChange={(e) => setEditValues((v) => v && { ...v, asf_rate: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(line); if (e.key === 'Escape') cancelEdit(); }}
                            className="w-12 rounded border px-1.5 py-1 text-xs text-right tabular-nums"
                            style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                            title="ASF rate (%) — set to 0 to skip ASF on this line"
                          />
                          <span className="text-[10px]" style={{ color: PALETTE.muted }}>%</span>
                        </div>
                        <div className="mt-0.5 text-[10px] tabular-nums" style={{ color: PALETTE.muted }}>
                          {formatCurrency(previewComputed?.asfAmount ?? 0)}
                        </div>
                      </td>
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
                    style={{
                      borderColor: PALETTE.border,
                      borderTop: isLatestVersion && dropIdx === i && draggingIdx !== i ? `2px solid ${PALETTE.accent}` : undefined,
                      opacity: draggingIdx === i ? 0.4 : 1,
                    }}
                    draggable={isLatestVersion}
                    onDragStart={isLatestVersion ? () => { setDraggingIdx(i); setDropIdx(null); } : undefined}
                    onDragOver={isLatestVersion ? (e) => { e.preventDefault(); setDropIdx(i); } : undefined}
                    onDrop={isLatestVersion ? (e) => { e.preventDefault(); handleReorder(draggingIdx, i); } : undefined}
                    onDragEnd={isLatestVersion ? () => { setDraggingIdx(null); setDropIdx(null); } : undefined}
                    onClick={isLatestVersion ? () => startEdit(line) : undefined}
                    title={isLatestVersion ? 'Click to edit · drag to reorder' : undefined}
                  >
                    <td
                      className="px-1 py-2 text-center"
                      style={{ cursor: isLatestVersion ? 'grab' : 'default', color: PALETTE.muted, opacity: 0.35, userSelect: 'none' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isLatestVersion && '⠿'}
                    </td>
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
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(line.asf_rate ?? 0) === 0 ? (
                        <span style={{ color: PALETTE.muted }} title="No ASF on this line — click to edit">—</span>
                      ) : (
                        <>
                          {formatCurrency(computed?.asfAmount ?? line.asf_amount)}
                          <span className="ml-1 text-[9px] opacity-60">{Math.round((line.asf_rate ?? DEFAULT_ASF_RATE) * 100)}%</span>
                        </>
                      )}
                    </td>
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

      {/* Add line form — below the table so new lines appear at the bottom */}
      {showAddLine && latestVersion && isLatestVersion && (
        <AddLineForm
          quoteVersionId={latestVersion.id}
          bookingId={bookingId}
          onSubmit={handleAddLine}
          onCancel={() => setShowAddLine(false)}
          busy={busy}
          primaryTalent={bookingTalent[0] ?? null}
          attachedCrew={(bookingCrew ?? []).map((bc) => ({
            crew_id: bc.crew_id,
            name: bc.crew?.name ?? bc.crew_id,
            gst_registered: bc.crew?.gst_registered ?? false,
          }))}
        />
      )}

      {/* Totals */}
      {feeLines.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          {/* Subtotal excl. GST + Grand Total incl. GST — always visible */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider" style={{ color: PALETTE.muted }}>Subtotal excl. GST</span>
            <span className="text-sm tabular-nums" style={{ color: PALETTE.muted }}>
              {formatCurrency(totals.subtotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1.5 mt-1 border-t" style={{ borderColor: PALETTE.border }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Grand Total incl. GST</span>
            <span
              className="text-2xl font-bold tabular-nums transition-colors"
              style={{ color: editingId ? PALETTE.accent : PALETTE.text }}
            >
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>

          {/* Toggle — click to reveal the full breakdown (subtotals, GST passthrough, agency margin) */}
          <button
            type="button"
            onClick={() => setShowFullBreakdown((v) => !v)}
            className="text-[11px] font-medium underline-offset-2 hover:underline"
            style={{ color: PALETTE.muted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showFullBreakdown ? '▴ Hide breakdown' : '▾ Show full breakdown'}
          </button>

          {showFullBreakdown && (
            <div className="space-y-4 border-t pt-3" style={{ borderColor: PALETTE.border }}>
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

          {/* Two separate panels:
              1. GST passthrough — what's collected vs claimed back vs owed to ATO.
                 GST is not margin, it flows through us; this panel makes that explicit.
              2. Agency margin — pure retained revenue (commission + ASF + super spread).
                 No GST annotations to confuse the picture. */}
          {(() => {
            const margin = computeAgencyMargin(totals);
            if (margin.total <= 0 && totals.totalGst <= 0) return null;

            // Estimate input credits from the booking team's GST status. Artist
            // GST applies to commissionable artist-side line types; crew GST
            // applies to crew_labour / overtime lines linked to GST-registered
            // crew. Equipment / studio / catering vendors invoice the agency
            // separately and are not modelled here.
            const primaryArtist = bookingTalent[0]?.talent;
            const artistGstRegistered = primaryArtist?.gst_registered ?? false;
            const artistFeeSubtotal = artistTotals.subtotal;

            const CREW_LABOUR_LINE_TYPES = new Set<FeeLineType>(['crew_labour', 'overtime']);
            const crewLabourSubtotalGstRegistered = previewLines
              .filter((l) => CREW_LABOUR_LINE_TYPES.has(l.line_type) && l.crew_id != null)
              .reduce((sum, l) => {
                const crewRow = bookingCrew.find((bc) => bc.crew_id === l.crew_id);
                return crewRow?.crew?.gst_registered ? sum + (l.subtotal ?? 0) : sum;
              }, 0);

            const gst = computeGstPassthrough({
              totals,
              artistFeeSubtotal,
              artistGstRegistered,
              crewLabourSubtotalGstRegistered,
            });

            return (
              <div className="space-y-3">
                {/* GST passthrough */}
                {gst.collectedTotal > 0 && (
                  <div
                    className="rounded-md border-l-2 px-3 py-2 space-y-1"
                    style={{ borderColor: PALETTE.muted, background: `${PALETTE.muted}10` }}
                  >
                    <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>
                      <span>GST (passthrough — owed to ATO)</span>
                      <span className="tabular-nums text-sm font-bold normal-case tracking-normal" style={{ color: PALETTE.text }}>
                        {formatCurrency(gst.netToAto)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between text-[11px]" style={{ color: PALETTE.muted }}>
                      <span>Collected from client</span>
                      <span className="tabular-nums">+{formatCurrency(gst.collectedTotal)}</span>
                    </div>
                    {gst.collectedOnCommission > 0 && (
                      <div className="flex items-baseline justify-between text-[10px] pl-3" style={{ color: PALETTE.muted, opacity: 0.75 }}>
                        <span>· incl. GST on commission</span>
                        <span className="tabular-nums">{formatCurrency(gst.collectedOnCommission)}</span>
                      </div>
                    )}
                    {gst.inputCreditsTotal > 0 && (
                      <>
                        <div className="flex items-baseline justify-between text-[11px]" style={{ color: PALETTE.muted }}>
                          <span>Input credits (paid through to suppliers)</span>
                          <span className="tabular-nums">−{formatCurrency(gst.inputCreditsTotal)}</span>
                        </div>
                        {gst.artistInputCredits > 0 && (
                          <div className="flex items-baseline justify-between text-[10px] pl-3" style={{ color: PALETTE.muted, opacity: 0.75 }}>
                            <span>· artist (GST-registered)</span>
                            <span className="tabular-nums">{formatCurrency(gst.artistInputCredits)}</span>
                          </div>
                        )}
                        {gst.crewInputCredits > 0 && (
                          <div className="flex items-baseline justify-between text-[10px] pl-3" style={{ color: PALETTE.muted, opacity: 0.75 }}>
                            <span>· crew (GST-registered)</span>
                            <span className="tabular-nums">{formatCurrency(gst.crewInputCredits)}</span>
                          </div>
                        )}
                      </>
                    )}
                    {gst.inputCreditsTotal === 0 && (
                      <div className="text-[10px] pl-3" style={{ color: PALETTE.muted, opacity: 0.7 }}>
                        No GST-registered talent or crew on this booking — net = collected.
                      </div>
                    )}
                  </div>
                )}

                {/* Agency margin (retained) */}
                {margin.total > 0 && (
                  <div
                    className="rounded-md border-l-2 px-3 py-2 space-y-1"
                    style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}08` }}
                  >
                    <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.accent }}>
                      <span>Agency margin (retained, ex-GST)</span>
                      <span className="tabular-nums text-sm font-bold normal-case tracking-normal">{formatCurrency(margin.total)}</span>
                    </div>
                    {margin.commission > 0 && (
                      <div className="flex items-baseline justify-between text-[11px]" style={{ color: PALETTE.muted }}>
                        <span>Commission (20% on artist labour)</span>
                        <span className="tabular-nums">{formatCurrency(margin.commission)}</span>
                      </div>
                    )}
                    {margin.asf > 0 && (
                      <div className="flex items-baseline justify-between text-[11px]" style={{ color: PALETTE.muted }}>
                        <span>ASF (15% on artist + outgoings)</span>
                        <span className="tabular-nums">{formatCurrency(margin.asf)}</span>
                      </div>
                    )}
                    {margin.superSpread > 0 && (
                      <div className="flex items-baseline justify-between text-[11px]" style={{ color: PALETTE.muted }}>
                        <span>Super spread (15% charged − 12% paid)</span>
                        <span className="tabular-nums">{formatCurrency(margin.superSpread)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
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

// Pass-through/fringe types where ASF defaults to off (client is reimbursing real costs).
const ASF_OFF_BY_DEFAULT = new Set<FeeLineType>([
  'crew_equipment', 'equipment_rental', 'studio_hire', 'travel',
  'catering', 'wardrobe', 'props', 'casting', 'location_fee',
  'permits', 'insurance', 'other_expense',
]);

// Artist-side line types — GST exempt when the payee is not GST-registered.
const ARTIST_LINE_TYPES = new Set<FeeLineType>([
  'artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production',
]);

// Crew labour line types — GST exempt when the crew member is not GST-registered.
const CREW_LINE_TYPES_SET = new Set<FeeLineType>(['crew_labour', 'overtime']);

function AddLineForm({
  quoteVersionId, bookingId, onSubmit, onCancel, busy,
  primaryTalent, attachedCrew,
}: {
  quoteVersionId: string;
  bookingId: string;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  busy: boolean;
  primaryTalent: import('@/lib/types/database').BookingTalent | null;
  attachedCrew: { crew_id: string; name: string; gst_registered: boolean }[];
}) {
  const [lineType, setLineType] = useState<FeeLineType>('artist_fee');
  const [chargeAsf, setChargeAsf] = useState<boolean>(!ASF_OFF_BY_DEFAULT.has('artist_fee'));
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');

  // GST exempt: artist lines → based on primary talent's registration; crew lines → based on selected crew; expenses → not exempt
  const primaryTalentGstRegistered = primaryTalent?.talent?.gst_registered ?? true;
  function defaultGstExempt(t: FeeLineType, crewId?: string): boolean {
    if (ARTIST_LINE_TYPES.has(t)) return !primaryTalentGstRegistered;
    if (CREW_LINE_TYPES_SET.has(t) && crewId) {
      const crew = attachedCrew.find((c) => c.crew_id === crewId);
      return crew ? !crew.gst_registered : false;
    }
    return false;
  }
  const [gstExempt, setGstExempt] = useState<boolean>(() => defaultGstExempt('artist_fee'));

  // Re-default ASF + GST toggles whenever line type changes — Jasper can still override.
  function handleLineTypeChange(t: FeeLineType) {
    setLineType(t);
    setChargeAsf(!ASF_OFF_BY_DEFAULT.has(t));
    setGstExempt(defaultGstExempt(t, selectedCrewId));
  }

  function handleCrewChange(crewId: string) {
    setSelectedCrewId(crewId);
    setGstExempt(defaultGstExempt(lineType, crewId));
  }

  const isCrewLine = CREW_LINE_TYPES_SET.has(lineType);
  const isArtistLine = ARTIST_LINE_TYPES.has(lineType);

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
            onChange={(e) => handleLineTypeChange(e.target.value as FeeLineType)}
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

      {/* Crew picker — shown for crew_labour / overtime so we can link the line and derive GST status */}
      {isCrewLine && attachedCrew.length > 0 && (
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Crew Member</label>
          <select
            value={selectedCrewId}
            onChange={(e) => handleCrewChange(e.target.value)}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="">— not linked to specific crew —</option>
            {attachedCrew.map((c) => (
              <option key={c.crew_id} value={c.crew_id}>{c.name}</option>
            ))}
          </select>
          <input type="hidden" name="crew_id" value={selectedCrewId} />
        </div>
      )}

      {/* Artist line: auto-link to primary talent */}
      {isArtistLine && primaryTalent && (
        <input type="hidden" name="talent_id" value={primaryTalent.talent_id} />
      )}

      <div className="grid gap-2 sm:grid-cols-4">
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
            ASF
          </label>
          <label
            className="mt-0.5 flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer select-none"
            style={{
              background: chargeAsf ? `${PALETTE.accent}10` : PALETTE.bg,
              borderColor: chargeAsf ? `${PALETTE.accent}55` : PALETTE.border,
              color: chargeAsf ? PALETTE.accent : PALETTE.muted,
            }}
            title="Uncheck to skip ASF on this line — useful for equipment rentals and other pass-through costs."
          >
            <input
              type="checkbox"
              checked={chargeAsf}
              onChange={(e) => setChargeAsf(e.target.checked)}
              className="accent-blue-400"
            />
            <span>Charge {(DEFAULT_ASF_RATE * 100).toFixed(0)}%</span>
          </label>
          <input type="hidden" name="asf_rate" value={chargeAsf ? DEFAULT_ASF_RATE : 0} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>
            GST
          </label>
          <label
            className="mt-0.5 flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer select-none"
            style={{
              background: gstExempt ? `${PALETTE.warning}10` : PALETTE.bg,
              borderColor: gstExempt ? `${PALETTE.warning}55` : PALETTE.border,
              color: gstExempt ? PALETTE.warning : PALETTE.muted,
            }}
            title={
              isArtistLine
                ? `Artist is ${primaryTalentGstRegistered ? 'GST registered — GST applies' : 'not GST registered — exempt by default'}`
                : 'Check if this payee is not GST registered'
            }
          >
            <input
              type="checkbox"
              checked={gstExempt}
              onChange={(e) => setGstExempt(e.target.checked)}
              className="accent-yellow-400"
            />
            <span>{gstExempt ? 'Exempt' : 'Applying'}</span>
          </label>
          <input type="hidden" name="gst_exempt" value={String(gstExempt)} />
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
