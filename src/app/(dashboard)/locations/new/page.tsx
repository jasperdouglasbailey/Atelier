import Topbar from '@/components/layout/Topbar';
import LocationForm from '@/components/locations/LocationForm';

export default function NewLocationPage() {
  return (
    <>
      <Topbar title="New Location" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <LocationForm />
      </div>
    </>
  );
}
