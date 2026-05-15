import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listLocations } from '@/lib/data/locations';
import { PALETTE } from '@/lib/utils/constants';
import LocationsClient from '@/components/locations/LocationsClient';

export default async function LocationsPage() {
  const locations = await listLocations({ active_only: false });

  return (
    <>
      <Topbar title="Locations" />
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div />
          <Link
            href="/locations/new"
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            + Add Location
          </Link>
        </div>
        <LocationsClient locations={locations} />
      </div>
    </>
  );
}
