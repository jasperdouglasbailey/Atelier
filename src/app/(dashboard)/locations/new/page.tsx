import Topbar from '@/components/layout/Topbar';
import LocationForm from '@/components/locations/LocationForm';
import { getAllLocationTags } from '@/lib/data/locations';

export default async function NewLocationPage() {
  const allTags = await getAllLocationTags();
  return (
    <>
      <Topbar title="New Location" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <LocationForm allTags={allTags} />
      </div>
    </>
  );
}
