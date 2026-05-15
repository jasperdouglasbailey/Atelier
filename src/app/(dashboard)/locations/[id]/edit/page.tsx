import { notFound } from 'next/navigation';
import Topbar from '@/components/layout/Topbar';
import LocationForm from '@/components/locations/LocationForm';
import { getLocation, getAllLocationTags } from '@/lib/data/locations';

type Props = { params: Promise<{ id: string }> };

export default async function EditLocationPage({ params }: Props) {
  const { id } = await params;
  const [loc, allTags] = await Promise.all([
    getLocation(id),
    getAllLocationTags(),
  ]);
  if (!loc) notFound();

  return (
    <>
      <Topbar title={`Edit — ${loc.name}`} />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <LocationForm location={loc} allTags={allTags} />
      </div>
    </>
  );
}
