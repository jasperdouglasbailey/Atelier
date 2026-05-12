import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listLocations } from '@/lib/data/locations';
import { PALETTE } from '@/lib/utils/constants';
import LocationsClient from '@/components/locations/LocationsClient';

export default async function LocationsPage() {
  const locations = await listLocations({ active_only: false });

  const activeCount = locations.filter((l) => l.is_active).length;

  return (
    <>
      <Topbar title="Locations" />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Location Library</h1>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>
              {activeCount} venue{activeCount !== 1 ? 's' : ''} · studios, outdoor spaces, retail
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

        {locations.length === 0 ? (
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
        ) : (
          <LocationsClient locations={locations} />
        )}
      </div>
    </>
  );
}
