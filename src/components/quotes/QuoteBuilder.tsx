'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import RegenerateQuoteV1Button from './RegenerateQuoteV1Button';
import type { QuoteVersion, FeeLine, FeeLineType, BookingTalent, BookingCrew } from '@/lib/types/database';
import type { RatePrecedent } from '@/lib/data/quotes';
import { computeQuoteTotals, type ComputedFeeLine } from '@/lib/utils/fee-engine';
import { isReimbursement } from '@/lib/utils/fee-engine';
import FinanceSummary from '@/components/bookings/FinanceSummary';
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

// Consolidated set (PR3, 2026-05-18). retouching merged into
// post_production; rentals + 8 expense subtypes folded into `expense`.
const LINE_TYPE_OPTIONS: FeeLineType[] = [
  'artist_fee', 'usage_licence', 'file_management', 'post_production',
  'artist_overtime', 'artist_travel',
  'crew_labour', 'crew_overtime', 'crew_travel',
  'expense',
];

// Artist / billable vs outgoing (crew + production costs)
const OUTGOING_TYPES = new Set<FeeLineType>([
  'crew_labour', 'crew_overtime', 'crew_travel', 'expense',
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
    /** Optional actual-cost override. Empty string = same as billed (= subtotal). */
    cost_subtotal: string;
    asf_rate: string; // stored as percent string, e.g. '15' or '0'
    /** Reimburse-to picker value: '' | 'talent:<uuid>' | 'crew:<uuid>'. */
    reimburse_target: string;
  } | null>(null);

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
    // Optional cost override — empty input = default to billed (=subtotal).
    const costTrim = editValues.cost_subtotal.trim();
    const costSubtotal = costTrim === '' ? null : (Number.isFinite(Number(costTrim)) ? Number(costTrim) : null);
    return { ...l, quantity: qty, unit_price: price, subtotal: qty * price, cost_subtotal: costSubtotal, asf_rate: asfRate };
  });
  const totals = computeQuoteTotals(previewLines);


  function startEdit(line: FeeLine) {
    setEditingId(line.id);
    setEditValues({
      line_type: line.line_type,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: String(line.unit_price),
      cost_subtotal: line.cost_subtotal != null ? String(line.cost_subtotal) : '',
      asf_rate: String(Math.round((line.asf_rate ?? DEFAULT_ASF_RATE) * 100)),
      reimburse_target:
        line.talent_id ? `talent:${line.talent_id}` :
        line.crew_id ? `crew:${line.crew_id}` : '',
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
    setError(null);
    const fd = new FormData();
    fd.set('line_type', editValues.line_type);
    fd.set('description', editValues.description);
    fd.set('quantity', editValues.quantity);
    fd.set('unit_price', editValues.unit_price);
    fd.set('booking_id', bookingId);
    // Reimbursement no longer needs to be sent — it's derived server-side
    // from `talent_id != null && !is_commissionable` on every read.
    const asfPct = parseFloat(editValues.asf_rate);
    if (Number.isFinite(asfPct)) {
      fd.set('asf_rate', String(asfPct / 100));
    }
    // Optional actual-cost override. Empty input = clear (set to null on server).
    const costTrim = editValues.cost_subtotal.trim();
    fd.set('cost_subtotal', costTrim);
    // Reimburse-to: route to talent_id OR crew_id (mutually exclusive).
    // Empty string clears any existing link. Server action accepts both keys.
    const rt = editValues.reimburse_target;
    fd.set('talent_id', rt.startsWith('talent:') ? rt.slice('talent:'.length) : '');
    fd.set('crew_id', rt.startsWith('crew:') ? rt.slice('crew:'.length) : '');
    // Optimistic: update local state immediately so the QuoteBuilder snaps
    // without waiting for the round-trip.
    const newQty = parseFloat(editValues.quantity) || line.quantity;
    const newPrice = parseFloat(editValues.unit_price) || line.unit_price;
    const newAsfRate = Number.isFinite(asfPct) ? asfPct / 100 : (line.asf_rate ?? DEFAULT_ASF_RATE);
    const newCostSubtotal = costTrim === '' ? null : (Number.isFinite(Number(costTrim)) ? Math.round(Number(costTrim) * 100) / 100 : null);
    const optimistic: FeeLine = {
      ...line,
      line_type: editValues.line_type,
      description: editValues.description,
      quantity: newQty,
      unit_price: newPrice,
      subtotal: Math.round(newQty * newPrice * 100) / 100,
      cost_subtotal: newCostSubtotal,
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
      setBusy(false);
      return;
    }
    // Refresh so every panel that reads booking data (JobPnLPanel, fee
    // summaries, P&L drift, etc.) reflects the saved change — not just
    // the QuoteBuilder's optimistic local state.
    router.refresh();
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
    // Confirm dialog removed deliberately — the optimistic UI snaps back on
    // server failure, and Jasper asked for the undo toast to go (annoying on
    // every line edit). If you ever need to restore deleted lines, fall back
    // to the audit log + restoreFeeLineAction in src/app/actions/quotes.ts.
    const snapshot = feeLines;
    setFeeLines((prev) => prev.filter((l) => l.id !== lineId));

    const result = await removeFeeLineAction(lineId, bookingId);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      setFeeLines(snapshot); // revert optimistic remove
      return;
    }
    router.refresh();
  }

  function handleReorder(fromIdx: number | null, toIdx: number) {
    if (fromIdx === null || fromIdx === toIdx) return;
    // Snapshot the order before mutating so we can revert if the server fails
    // — without this, a failed reorder would optimistically show the new order,
    // then router.refresh() would snap back to the old order, leaving the user
    // wondering why their drag didn't stick.
    const snapshot = feeLines;
    const newLines = [...feeLines];
    const [moved] = newLines.splice(fromIdx, 1);
    newLines.splice(toIdx, 0, moved);
    setFeeLines(newLines);
    setDraggingIdx(null);
    setDropIdx(null);
    const orderedIds = newLines.map((l) => l.id);
    startReorderTransition(async () => {
      const result = await reorderFeeLinesAction(orderedIds, bookingId);
      if (!result.ok) {
        // Revert the optimistic reorder and tell the user why.
        setFeeLines(snapshot);
        setError(result.error ?? 'Failed to save new order — please try again.');
        return;
      }
      router.refresh();
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
                <th className="px-3 py-2 text-right font-medium" style={{ color: PALETTE.muted }} title="Agency Service Fee — 15% of each line by default. Covers agency overhead, coordination and the talent's booking guarantee.">ASF ⓘ</th>
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
                  const previewSubtotal = previewQty * previewPrice;
                  const previewComputed = totals.lines[i];
                  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') commitEdit(line); if (e.key === 'Escape') cancelEdit(); };

                  return (
                    <tr key={line.id} className="border-t" style={{ borderColor: PALETTE.border, background: `${PALETTE.accent}08` }}>
                      <td colSpan={10} className="p-3">
                        <div className="flex flex-col gap-3">
                          {/* Row 1 — Type + Description (full width) */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={editValues.line_type}
                              onChange={(e) => {
                                const next = e.target.value as FeeLineType;
                                setEditValues((v) => v && {
                                  ...v,
                                  line_type: next,
                                  // Reimbursement is now derived from talent_id + commissionable,
                                  // so no longer needs explicit clearing on type change.
                                });
                              }}
                              className="rounded border px-2 py-1.5 text-xs"
                              style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text, minWidth: 160 }}
                            >
                              {LINE_TYPE_OPTIONS.map((t) => (
                                <option key={t} value={t}>{FEE_LINE_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                            <input
                              autoFocus
                              value={editValues.description}
                              onChange={(e) => setEditValues((v) => v && { ...v, description: e.target.value })}
                              onKeyDown={onKey}
                              placeholder="Description"
                              className="flex-1 rounded border px-2 py-1.5 text-xs"
                              style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text, minWidth: 240 }}
                            />
                          </div>

                          {/* Row 2 — Numeric fields aligned left, subtotal on the right */}
                          <div className="flex items-center gap-4 flex-wrap">
                            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: PALETTE.muted }}>
                              Qty
                              <input
                                type="number" step="0.5" min="0"
                                value={editValues.quantity}
                                onChange={(e) => setEditValues((v) => v && { ...v, quantity: e.target.value })}
                                onKeyDown={onKey}
                                className="w-20 rounded border px-2 py-1 text-xs text-right tabular-nums"
                                style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: PALETTE.muted }}>
                              Unit $
                              <input
                                type="number" step="0.01" min="0"
                                value={editValues.unit_price}
                                onChange={(e) => setEditValues((v) => v && { ...v, unit_price: e.target.value })}
                                onKeyDown={onKey}
                                className="w-28 rounded border px-2 py-1 text-xs text-right tabular-nums"
                                style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: PALETTE.muted }}>
                              ASF
                              <input
                                type="number" step="1" min="0" max="100"
                                value={editValues.asf_rate}
                                onChange={(e) => setEditValues((v) => v && { ...v, asf_rate: e.target.value })}
                                onKeyDown={onKey}
                                className="w-16 rounded border px-2 py-1 text-xs text-right tabular-nums"
                                style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text }}
                                title="ASF rate (%) — set to 0 to skip ASF on this line"
                              />
                              %
                            </label>
                            <span className="ml-auto text-[11px] tabular-nums" style={{ color: PALETTE.muted }}>
                              Subtotal <span className="font-medium" style={{ color: PALETTE.text }}>{formatCurrency(previewSubtotal)}</span>
                            </span>
                          </div>

                          {/* Row 2.5 — Optional actual cost when different from billed.
                              Empty = paid the billed amount. Filled = agency captures
                              the difference as margin (e.g. quoted $600, invoiced $550 → cost field is $550). */}
                          <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ color: PALETTE.muted }}>
                            <label className="flex items-center gap-1.5" title="Actual amount paid to the payee. Leave blank to default to the billed subtotal. Use when a payee invoices less than what was quoted to the client — agency captures the spread as margin.">
                              Cost (paid) $
                              <input
                                type="number" step="0.01" min="0"
                                value={editValues.cost_subtotal}
                                onChange={(e) => setEditValues((v) => v && { ...v, cost_subtotal: e.target.value })}
                                onKeyDown={onKey}
                                placeholder={`${(previewSubtotal).toFixed(2)} (default)`}
                                className="w-28 rounded border px-2 py-1 text-xs text-right tabular-nums"
                                style={{
                                  background: PALETTE.bg,
                                  borderColor: editValues.cost_subtotal.trim() !== '' ? PALETTE.ok + '88' : PALETTE.border,
                                  color: PALETTE.text,
                                }}
                              />
                            </label>
                            {editValues.cost_subtotal.trim() !== '' && Number.isFinite(Number(editValues.cost_subtotal)) && (() => {
                              const cost = Number(editValues.cost_subtotal);
                              const spread = Math.max(0, previewSubtotal - cost);
                              if (spread <= 0) return <span style={{ opacity: 0.7 }}>No spread (cost ≥ billed)</span>;
                              return (
                                <span style={{ color: PALETTE.ok }}>
                                  Spread captured: <strong>{formatCurrency(spread)}</strong>
                                </span>
                              );
                            })()}
                          </div>

                          {/* Row 2.6 — Reimburse-to picker. Only on expense
                              lines, only when the booking actually has a
                              person (talent or attached crew) to reimburse. */}
                          {editValues.line_type === 'expense' && (bookingTalent[0] || (bookingCrew ?? []).length > 0) && (
                            <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: PALETTE.muted }}>
                              <label className="flex items-center gap-1.5" title="Pass this expense through to the named person — engine treats it as a reimbursement and passes GST through if they're GST-registered. Leave blank for an agency cost.">
                                Reimburse to
                                <select
                                  value={editValues.reimburse_target}
                                  onChange={(ev) => setEditValues((v) => v && { ...v, reimburse_target: ev.target.value })}
                                  className="rounded border px-2 py-1 text-xs"
                                  style={{ background: PALETTE.bg, borderColor: PALETTE.accent + '66', color: PALETTE.text, minWidth: 200 }}
                                >
                                  <option value="">— not a reimbursement —</option>
                                  {bookingTalent[0]?.talent && (
                                    <option value={`talent:${bookingTalent[0].talent_id}`}>
                                      {bookingTalent[0].talent.working_name ?? 'Primary talent'} (artist)
                                    </option>
                                  )}
                                  {(bookingCrew ?? []).map((bc) => (
                                    <option key={bc.crew_id} value={`crew:${bc.crew_id}`}>
                                      {bc.crew?.name ?? bc.crew_id} (crew)
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          )}

                          {/* Row 3 — Live computed preview */}
                          <div className="text-[10px] tabular-nums" style={{ color: PALETTE.muted }}>
                            ASF <span style={{ color: PALETTE.text }}>{formatCurrency(previewComputed?.asfAmount ?? 0)}</span>
                            <span className="mx-1.5">·</span>
                            GST <span style={{ color: PALETTE.text }}>{formatCurrency(previewComputed?.gstAmount ?? 0)}</span>
                            <span className="mx-1.5">·</span>
                            Line Total <span className="font-semibold" style={{ color: PALETTE.text }}>{formatCurrency(previewComputed?.lineTotal ?? 0)}</span>
                          </div>

                          {/* Row 4 — Reimburse toggle (left) + actions (right) */}
                          <div className="flex items-center justify-between gap-3 pt-2 border-t flex-wrap" style={{ borderColor: PALETTE.border }}>
                            {/* Reimbursement is now derived: any non-commissionable line
                                with a talent_id linked is treated as a reimbursement.
                                The standalone "Mark as artist reimbursement" tickbox was
                                removed — pick a talent in the person picker above to
                                make this line a reimbursement to them. */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={busy}
                                className="rounded px-3 py-1 text-[11px] disabled:opacity-50"
                                style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
                              >
                                Cancel <span style={{ opacity: 0.6 }}>(Esc)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => commitEdit(line)}
                                disabled={busy}
                                className="rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50"
                                style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: busy ? 'wait' : 'pointer' }}
                              >
                                {busy ? 'Saving…' : 'Save (↵)'}
                              </button>
                            </div>
                          </div>
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
                      title={isLatestVersion ? 'Drag to reorder' : undefined}
                      style={{ cursor: isLatestVersion ? 'grab' : 'default', color: PALETTE.muted, opacity: isLatestVersion ? 0.75 : 0, userSelect: 'none' }}
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
                      {isReimbursement(line) && (
                        <span
                          className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: `${PALETTE.ok}18`, color: PALETTE.ok }}
                          title="Reimbursement (derived from talent link) — added to artist payout in P&L"
                        >
                          reimb.
                        </span>
                      )}
                      {line.cost_subtotal != null && line.cost_subtotal !== line.subtotal && (
                        <span
                          className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: `${PALETTE.ok}18`, color: PALETTE.ok }}
                          title={`Cost paid: ${formatCurrency(line.cost_subtotal)} — agency captures ${formatCurrency(Math.max(0, line.subtotal - line.cost_subtotal))} spread`}
                        >
                          cost ${line.cost_subtotal}
                        </span>
                      )}
                      {isLatestVersion && <span className="ml-1.5 opacity-0 group-hover:opacity-100 text-[9px] transition-opacity" style={{ color: PALETTE.muted }}>edit</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatCurrency(line.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatCurrency(computed?.subtotal ?? line.subtotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {(line.asf_rate ?? 0) === 0 ? (
                        <span style={{ color: PALETTE.muted }} title="No ASF on this line — click to edit">—</span>
                      ) : (
                        <div className="flex flex-col items-end leading-tight">
                          <span>{formatCurrency(computed?.asfAmount ?? line.asf_amount)}</span>
                          <span className="text-[9px] mt-0.5" style={{ color: PALETTE.muted }}>
                            {Math.round((line.asf_rate ?? DEFAULT_ASF_RATE) * 100)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatCurrency(computed?.gstAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium align-top">{formatCurrency(computed?.lineTotal ?? 0)}</td>
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

      {/* Totals — four-tile metric strip + per-line summary table + collapsible
          "Where every dollar goes". Implementation lives in FinanceSummary so
          this section reads as data-in, view-out. Pass the live `previewLines`
          + `totals` so inline-edit previews keep updating the summary. */}
      {feeLines.length > 0 && (
        <FinanceSummary
          feeLines={previewLines}
          totals={totals}
          bookingTalent={bookingTalent}
          bookingCrew={bookingCrew}
        />
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

// The "Where every dollar goes" / agency-keeps / ATO / paid-through
// breakdown now lives in `<FinanceSummary />` (src/components/bookings/
// FinanceSummary.tsx). Helpers that used to render the old waterfall
// (FlowRow, BreakdownBucket, RunningDeductions) were removed when the
// new four-tile + per-line-table + collapsible layout shipped.

// ============================================================
// Add line form (inline)
// ============================================================

// ASF defaults to 15% on every line type. The agency adds margin on
// labour AND production expenses (this is the canonical fee model). Per
// the doctrine in CLAUDE.md "Fee model rules". Toggleable per line if
// the user wants to pass a line through at cost.
const ASF_OFF_BY_DEFAULT = new Set<FeeLineType>();

// Post-consolidation (PR3, 2026-05-18): the previous "rentals always GST"
// doctrine was retired. With cost-vs-billed split (PR#145) already
// handling input-credit GST correctly per payee, all expense lines
// (including former rentals) just default to charge-GST-on and follow
// the linked-person rule for input credits. Empty set retained for now
// in case a future line type needs the always-on override.
const ALWAYS_GST_LINE_TYPES = new Set<FeeLineType>();

// Artist-side commissionable line types. retouching merged into
// post_production in PR3.
const ARTIST_LINE_TYPES = new Set<FeeLineType>([
  'artist_fee', 'usage_licence', 'file_management', 'post_production', 'artist_overtime', 'artist_travel',
]);

// Crew-relevant line types — picker for who to link/reimburse appears
// on these; GST default follows linked crew member's registration.
// Includes `expense` because any expense can be reimbursed to a crew
// member (or talent). Excludes all artist-side types (handled by the
// primary-talent auto-link).
const CREW_LINE_TYPES_SET = new Set<FeeLineType>(['crew_labour', 'crew_overtime', 'crew_travel', 'expense']);

/** Commissionable lines can never be reimbursable. */
function isCommissionable(t: FeeLineType): boolean {
  return ARTIST_LINE_TYPES.has(t);
}

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
  // For expense lines, the picker can route to talent OR crew. Value
  // shape: '' | 'talent:<uuid>' | 'crew:<uuid>'. On submit we parse
  // this into one of talent_id / crew_id (mutually exclusive).
  const [reimburseTarget, setReimburseTarget] = useState<string>('');
  // Reimbursement-flag state removed — derived server-side from
  // talent_id + commissionable. UI selecting a person on a non-
  // commissionable line IS the reimbursement signal.

  // GST: default on. Only flips off when the payee is a known non-GST-
  // registered person (artist line + non-registered talent, or crew line
  // with a non-registered crew member selected). Equipment lines always
  // apply GST regardless of payee (the supplier invoice has GST on it).
  // Expenses + studio + props etc. default on, flip off only via crew
  // GST status.
  const primaryTalentGstRegistered = primaryTalent?.talent?.gst_registered ?? true;
  function defaultChargeGst(t: FeeLineType, crewId?: string): boolean {
    if (ALWAYS_GST_LINE_TYPES.has(t)) return true;
    if (ARTIST_LINE_TYPES.has(t)) return primaryTalentGstRegistered;
    if (CREW_LINE_TYPES_SET.has(t) && crewId) {
      const crew = attachedCrew.find((c) => c.crew_id === crewId);
      return crew ? crew.gst_registered : true;
    }
    return true;
  }
  const [chargeGst, setChargeGst] = useState<boolean>(() => defaultChargeGst('artist_fee'));

  // Re-default ASF + GST toggles whenever line type changes — Jasper can still override.
  function handleLineTypeChange(t: FeeLineType) {
    setLineType(t);
    setChargeAsf(!ASF_OFF_BY_DEFAULT.has(t));
    setChargeGst(defaultChargeGst(t, selectedCrewId));
  }

  function handleCrewChange(crewId: string) {
    setSelectedCrewId(crewId);
    setChargeGst(defaultChargeGst(lineType, crewId));
  }

  const isCrewLine = CREW_LINE_TYPES_SET.has(lineType);
  const isArtistLine = ARTIST_LINE_TYPES.has(lineType);
  const isExpenseLine = lineType === 'expense';
  // Parse reimburseTarget into the right hidden field for submission.
  const reimburseTalentId = reimburseTarget.startsWith('talent:') ? reimburseTarget.slice('talent:'.length) : '';
  const reimburseCrewId = reimburseTarget.startsWith('crew:') ? reimburseTarget.slice('crew:'.length) : '';

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

      {/* Crew picker — shown for crew_labour / crew_overtime / crew_travel
          so we can link the line and derive GST status. Hidden for `expense`
          because expense uses the unified Reimburse-to picker below. */}
      {isCrewLine && !isExpenseLine && attachedCrew.length > 0 && (
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

      {/* Expense lines: unified "Reimburse to" picker. Routes to either
          talent_id or crew_id. Picking a person AND keeping the line
          non-commissionable makes it a reimbursement — engine passes
          the GST through to that person if they're GST-registered. */}
      {isExpenseLine && (primaryTalent || attachedCrew.length > 0) && (
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>
            Reimburse to
            <span className="ml-2 font-normal normal-case" style={{ color: PALETTE.muted, opacity: 0.7 }}>
              (optional — leave blank for an agency cost)
            </span>
          </label>
          <select
            value={reimburseTarget}
            onChange={(e) => setReimburseTarget(e.target.value)}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="">— not a reimbursement —</option>
            {primaryTalent?.talent && (
              <option value={`talent:${primaryTalent.talent_id}`}>
                {primaryTalent.talent.working_name ?? 'Primary talent'} (artist)
              </option>
            )}
            {attachedCrew.map((c) => (
              <option key={c.crew_id} value={`crew:${c.crew_id}`}>
                {c.name} (crew)
              </option>
            ))}
          </select>
          <input type="hidden" name="talent_id" value={reimburseTalentId} />
          <input type="hidden" name="crew_id" value={reimburseCrewId} />
        </div>
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
              style={{ accentColor: PALETTE.accent }}
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
              background: chargeGst ? `${PALETTE.accent}0d` : `${PALETTE.warning}10`,
              borderColor: chargeGst ? `${PALETTE.accent}55` : `${PALETTE.warning}55`,
              color: chargeGst ? PALETTE.accent : PALETTE.warning,
            }}
            title={
              isArtistLine
                ? `Artist is ${primaryTalentGstRegistered ? 'GST registered — GST applies (default)' : 'not GST registered — GST does NOT apply (default)'}`
                : 'Tick when the payee is GST-registered. Untick for non-GST-registered payees so GST is excluded from this line.'
            }
          >
            <input
              type="checkbox"
              checked={chargeGst}
              onChange={(e) => setChargeGst(e.target.checked)}
              style={{ accentColor: PALETTE.accent }}
            />
            <span>{chargeGst ? 'Charge GST' : 'GST exempt'}</span>
          </label>
          <input type="hidden" name="gst_exempt" value={String(!chargeGst)} />
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

      {/* Reimbursement tickbox removed. Reimbursement is now derived
          server-side from `talent_id != null && !is_commissionable`. To
          mark a non-commissionable line as a reimbursement, pick the
          artist in the talent picker above — the link IS the signal. */}

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
