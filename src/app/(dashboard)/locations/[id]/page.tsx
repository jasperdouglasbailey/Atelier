import Link from 'next/link';
import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import { getLocation } from '@/lib/data/locations';
import { PALETTE } from '@/lib/utils/constants';
import type { StudioType } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

const STUDIO_TYPE_LABELS: Record<StudioType, string> = {
  photo_studio: 'Photo Studio',
  film_studio: 'Film Studio',
  outdoor: 'Outdoor',
  retail: 'Retail',
  residential: 'Residential',
  venue: 'Venue',
  other: 'Other',
};

const FACILITY_LABELS: Record<string, string> = {
  change_rooms: 'Change rooms',
  kitchen: 'Kitchen',
  wifi: 'Wi-Fi',
  air_con: 'Air conditioning',
  natural_light: 'Natural light',
  cyclorama: 'Cyclorama',
  loading_dock: 'Loading dock',
  lift_access: 'Lift access',
  power_3phase: '3-phase power',
  outdoor_space: 'Outdoor space',
  catering_available: 'Catering available',
  parking_onsite: 'On-site parking',
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 py-2 border-b text-sm" style={{ borderColor: PALETTE.border }}>
      <span className="w-40 flex-shrink-0 text-xs" style={{ color: PALETTE.muted }}>{label}</span>
      <span style={{ color: PALETTE.text }}>{value}</span>
    </div>
  );
}

export default async function LocationDetailPage({ params }: Props) {
  const { id } = await params;
  const loc = await getLocation(id);
  if (!loc) notFound();

  const fullRate = loc.full_day_rate ? `$${loc.full_day_rate.toLocaleString()}` : null;
  const halfRate = loc.half_day_rate ? `$${loc.half_day_rate.toLocaleString()}` : null;
  const rateStr = [halfRate && `${halfRate} half-day`, fullRate && `${fullRate} full day`]
    .filter(Boolean).join(' · ') || null;
  const surchargeStr = loc.weekend_surcharge_pct
    ? `${Math.round(loc.weekend_surcharge_pct * 100)}% weekend surcharge`
    : null;

  return (
    <>
      <Topbar title={loc.name} />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: PALETTE.text }}>{loc.name}</h1>
              {!loc.is_active && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${PALETTE.muted}22`, color: PALETTE.muted }}>
                  Inactive
                </span>
              )}
            </div>
            {loc.alias && <p className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>{loc.alias}</p>}
            <span
              className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent }}
            >
              {STUDIO_TYPE_LABELS[loc.studio_type]}
            </span>
          </div>
          <Link
            href={`/locations/${id}/edit`}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
          >
            Edit
          </Link>
        </div>

        {/* Address */}
        <section className="mb-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Address</h2>
          <div className="rounded-lg border p-4 text-sm space-y-1" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
            {loc.address && <div style={{ color: PALETTE.text }}>{loc.address}</div>}
            {(loc.suburb || loc.state) && (
              <div style={{ color: PALETTE.muted }}>
                {[loc.suburb, loc.state, loc.postcode].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </section>

        {/* Contact */}
        {(loc.contact_name || loc.contact_email || loc.contact_phone || loc.website) && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Contact</h2>
            <div className="rounded-lg border" style={{ borderColor: PALETTE.border }}>
              <Row label="Name" value={loc.contact_name} />
              <Row label="Email" value={loc.contact_email} />
              <Row label="Phone" value={loc.contact_phone} />
              <Row label="Website" value={loc.website} />
            </div>
          </section>
        )}

        {/* Rates */}
        {(rateStr || loc.rate_notes) && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Rates</h2>
            <div className="rounded-lg border" style={{ borderColor: PALETTE.border }}>
              <Row label="Hire rate" value={rateStr} />
              <Row label="Weekend" value={surchargeStr} />
              <Row label="Notes" value={loc.rate_notes} />
            </div>
          </section>
        )}

        {/* Facilities */}
        {loc.facilities && loc.facilities.length > 0 && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Facilities</h2>
            <div className="flex flex-wrap gap-1.5">
              {loc.facilities.map((f) => (
                <span
                  key={f}
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{ background: `${PALETTE.success}18`, color: PALETTE.success, border: `1px solid ${PALETTE.success}33` }}
                >
                  {FACILITY_LABELS[f] ?? f}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Space */}
        {(loc.square_metres || loc.max_capacity) && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Space</h2>
            <div className="rounded-lg border" style={{ borderColor: PALETTE.border }}>
              {loc.square_metres && <Row label="Area" value={`${loc.square_metres} m²`} />}
              {loc.max_capacity && <Row label="Max capacity" value={`${loc.max_capacity} persons`} />}
            </div>
          </section>
        )}

        {/* Logistics */}
        {(loc.parking_notes || loc.access_notes) && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Logistics</h2>
            <div className="rounded-lg border" style={{ borderColor: PALETTE.border }}>
              <Row label="Parking" value={loc.parking_notes} />
              <Row label="Access / arrival" value={loc.access_notes} />
            </div>
          </section>
        )}

        {/* Notes */}
        {loc.notes && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: PALETTE.muted }}>Notes</h2>
            <div className="rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap" style={{ borderColor: PALETTE.border, color: PALETTE.text }}>
              {loc.notes}
            </div>
          </section>
        )}

        <div className="pt-2">
          <Link href="/locations" className="text-xs" style={{ color: PALETTE.muted }}>
            Back to Locations
          </Link>
        </div>
      </div>
    </>
  );
}
