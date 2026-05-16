'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UsageLicence, UsageMedia, UsageTerritory } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { addUsageLicenceAction, removeUsageLicenceAction } from '@/app/actions/usage-licences';

type Props = {
  bookingId: string;
  licences: UsageLicence[];
};

const MEDIA_OPTIONS: { value: UsageMedia; label: string }[] = [
  { value: 'all_media', label: 'All Media' },
  { value: 'all_print', label: 'All Print' },
  { value: 'all_digital', label: 'All Digital' },
  { value: 'ooh', label: 'OOH' },
  { value: 'press', label: 'Press' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'company_website', label: 'Company Website' },
  { value: 'internet_advertising', label: 'Internet Ads' },
  { value: 'tv', label: 'TV' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'pos', label: 'POS' },
  { value: 'brochures', label: 'Brochures' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'posters', label: 'Posters' },
  { value: 'collateral', label: 'Collateral' },
  { value: 'digital_posters', label: 'Digital Posters' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'intranet', label: 'Intranet' },
  { value: 'ambient', label: 'Ambient' },
  { value: 'marketing_aids', label: 'Marketing Aids' },
];

const TERRITORY_OPTIONS: { value: UsageTerritory; label: string }[] = [
  { value: 'worldwide', label: 'Worldwide' },
  { value: 'australia', label: 'Australia' },
  { value: 'oceania', label: 'Oceania' },
  { value: 'usa', label: 'USA' },
  { value: 'north_america', label: 'North America' },
  { value: 'europe_all', label: 'Europe (All)' },
  { value: 'uk', label: 'UK' },
  { value: 'asia_incl_japan', label: 'Asia (incl. Japan)' },
  { value: 'asia_excl_japan', label: 'Asia (excl. Japan)' },
  { value: 'middle_east', label: 'Middle East' },
  { value: 'africa', label: 'Africa' },
  { value: 'emea', label: 'EMEA' },
  { value: 'amet', label: 'AMET' },
  { value: 'gcc', label: 'GCC' },
  { value: 'uae', label: 'UAE' },
  { value: 'nordics', label: 'Nordics' },
  { value: 'latin_america', label: 'Latin America' },
];

const PERIOD_OPTIONS = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '1 year' },
  { months: 24, label: '2 years' },
  { months: 36, label: '3 years' },
  { months: 60, label: '5 years' },
  { months: 999, label: 'In perpetuity' },
];

export default function UsageLicenceBuilder({ bookingId, licences }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<UsageMedia[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<UsageTerritory[]>([]);

  function toggleMedia(m: UsageMedia) {
    setSelectedMedia(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }
  function toggleTerritory(t: UsageTerritory) {
    setSelectedTerritory(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleAdd(formData: FormData) {
    formData.set('media', selectedMedia.join(','));
    formData.set('territory', selectedTerritory.join(','));
    setBusy(true);
    await addUsageLicenceAction(formData);
    setShowAdd(false);
    setSelectedMedia([]);
    setSelectedTerritory([]);
    router.refresh();
    setBusy(false);
  }

  function handleCancel() {
    setShowAdd(false);
    setSelectedMedia([]);
    setSelectedTerritory([]);
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this usage licence?')) return;
    setBusy(true);
    await removeUsageLicenceAction(id, bookingId);
    router.refresh();
    setBusy(false);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">
          Usage Licences ({licences.length})
        </h3>
        <button
          onClick={showAdd ? handleCancel : () => setShowAdd(true)}
          className="rounded px-2.5 py-1 text-[11px] font-medium"
          style={{ background: showAdd ? 'transparent' : `${PALETTE.accent}22`, color: PALETTE.accent }}
        >
          {showAdd ? 'Cancel' : '+ Add Licence'}
        </button>
      </div>

      {/* Existing licences */}
      {licences.map((lic) => (
        <div key={lic.id} className="rounded border p-3" style={{ borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex flex-wrap gap-1 mb-1">
                {lic.media.map(m => (
                  <span key={m} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${PALETTE.accent}15`, color: PALETTE.accent }}>
                    {MEDIA_OPTIONS.find(o => o.value === m)?.label ?? m}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {lic.territory.map(t => (
                  <span key={t} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${PALETTE.warning}15`, color: PALETTE.warning }}>
                    {TERRITORY_OPTIONS.find(o => o.value === t)?.label ?? t}
                  </span>
                ))}
              </div>
              <div className="text-[10px] flex gap-3" style={{ color: PALETTE.muted }}>
                <span>{lic.duration_months >= 999 ? 'In perpetuity' : `${lic.duration_months} months`}</span>
                <span className="font-medium" style={{ color: PALETTE.text }}>{formatCurrency(lic.fee)}</span>
              </div>
              {lic.notes && <div className="text-[10px] mt-1" style={{ color: PALETTE.muted }}>{lic.notes}</div>}
            </div>
            <button onClick={() => handleRemove(lic.id)} className="text-[10px]" style={{ color: PALETTE.danger }}>x</button>
          </div>
        </div>
      ))}

      {licences.length === 0 && !showAdd && (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>No usage licences attached.</p>
      )}

      {/* Add form */}
      {showAdd && (
        <form action={handleAdd} className="rounded-lg border p-3 space-y-3" style={{ background: PALETTE.surface, borderColor: `${PALETTE.accent}44` }}>
          <input type="hidden" name="booking_id" value={bookingId} />

          {/* Media selection */}
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>Media</label>
            <div className="flex flex-wrap gap-1">
              {MEDIA_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleMedia(o.value)}
                  className="rounded px-2 py-0.5 text-[10px] border transition"
                  style={{
                    borderColor: selectedMedia.includes(o.value) ? PALETTE.accent : PALETTE.border,
                    background: selectedMedia.includes(o.value) ? `${PALETTE.accent}22` : 'transparent',
                    color: selectedMedia.includes(o.value) ? PALETTE.accent : PALETTE.muted,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Territory selection */}
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>Territory</label>
            <div className="flex flex-wrap gap-1">
              {TERRITORY_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleTerritory(o.value)}
                  className="rounded px-2 py-0.5 text-[10px] border transition"
                  style={{
                    borderColor: selectedTerritory.includes(o.value) ? PALETTE.warning : PALETTE.border,
                    background: selectedTerritory.includes(o.value) ? `${PALETTE.warning}22` : 'transparent',
                    color: selectedTerritory.includes(o.value) ? PALETTE.warning : PALETTE.muted,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Period</label>
              <select name="duration_months" className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}>
                {PERIOD_OPTIONS.map(p => (
                  <option key={p.months} value={p.months}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Fee ($) *</label>
              <input
                name="fee"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="e.g. 2400"
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
                style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              />
            </div>
          </div>
          {/* BUR calculator removed — it was a glorified two-number multiplier,
              not a real calculator. Fee is now a direct input. Structured usage
              valuation (media × territory × duration → fee) is a separate piece
              of work, not a UI affordance dressed up as one. */}

          <div>
            <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Notes</label>
            <input name="notes" placeholder="e.g. Exclusive to social channels" className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
          </div>

          <button type="submit" disabled={busy || selectedMedia.length === 0 || selectedTerritory.length === 0} className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
            Add Licence
          </button>
        </form>
      )}
    </section>
  );
}
