import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listLocations } from '@/lib/data/locations';
import { PALETTE } from '@/lib/utils/constants';
import type { StudioType } from '@/lib/types/database';

const STUDIO_TYPE_LABELS: Record<StudioType, string> = {
  photo_studio: 'Photo Studio',
  film_studio: 'Film Studio',
  outdoor: 'Outdoor',
  retail: 'Retail',
  residential: 'Residential',
  venue: 'Venue',
  other: 'Other',
};

function formatRate(half: number | null, full: number | null) {
  if (!half && !full) return null;
  const parts: string[] = [];
  if (half) parts.push(`$${half.toLocaleString()} half`);
  if (full) parts.push(`$${full.toLocaleString()} full`);
  return parts.join(' · ');
}

export default async function LocationsPage() {
  const locations = await listLocations({ active_only: false });

  const active = locations.filter((l) => l.is_active);
  const inactive = locations.filter((l) => !l.is_active);

  return (
    <>
      <Topbar title="Locations" />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Location Library</h1>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>
              {active.length} venue{active.length !== 1 ? 's' : ''} · studios, outdoor spaces, retail
            </p>
          </div>
          <Link
            href="/locations/new"
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            + Add Location
          </Link>
        </div>

        {locations.length === 0 && (
          <div className="rounded-lg border p-12 text-center" style={{ borderColor: PALETTE.border }}>
            <p className="text-sm" style={{ color: PALETTE.muted }}>No locations yet.</p>
            <p className="text-xs mt-1" style={{ color: PALETTE.muted }}>
              Add studios, outdoor spaces, and venues to pre-fill booking forms.
            </p>
            <Link
              href="/locations/new"
              className="mt-4 inline-block rounded px-4 py-2 text-xs font-medium"
              style={{ background: PALETTE.accent, color: PALETTE.bg }}
            >
              Add first location
            </Link>
          </div>
        )}

        {active.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((loc) => {
              const rate = formatRate(loc.half_day_rate, loc.full_day_rate);
              return (
                <Link
                  key={loc.id}
                  href={`/locations/${loc.id}`}
                  className="block rounded-lg border p-4 hover:border-opacity-80 transition"
                  style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate" style={{ color: PALETTE.text }}>{loc.name}</div>
                      {loc.alias && (
                        <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{loc.alias}</div>
                      )}
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent }}
                    >
                      {STUDIO_TYPE_LABELS[loc.studio_type]}
                    </span>
                  </div>

                  <div className="mt-2 space-y-0.5">
                    {(loc.suburb || loc.address) && (
                      <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>
                        {loc.suburb ? `${loc.suburb}, ${loc.state}` : loc.address}
                      </div>
                    )}
                    {rate && (
                      <div className="text-[11px]" style={{ color: PALETTE.muted }}>{rate}</div>
                    )}
                    {loc.contact_name && (
                      <div className="text-[11px]" style={{ color: PALETTE.muted }}>Contact: {loc.contact_name}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {inactive.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: PALETTE.muted }}>
              Inactive ({inactive.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {inactive.map((loc) => (
                <Link
                  key={loc.id}
                  href={`/locations/${loc.id}`}
                  className="block rounded border px-4 py-3 opacity-60"
                  style={{ borderColor: PALETTE.border }}
                >
                  <span className="text-sm" style={{ color: PALETTE.muted }}>{loc.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
