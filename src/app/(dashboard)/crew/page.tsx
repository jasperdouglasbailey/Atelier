import Topbar from '@/components/layout/Topbar';
import { listCrew, listCrewCities } from '@/lib/data/entities';
import CreateCrewDialog from '@/components/entities/CreateCrewDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';
import CrewClient from '@/components/crew/CrewClient';

type SearchParams = Promise<{ group?: string }>;

export default async function CrewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const groupByCity = params.group !== 'flat';

  const [crew, cities] = await Promise.all([
    listCrew({}),
    listCrewCities(),
  ]);

  return (
    <>
      <Topbar title="Crew" />
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div />
          <div className="flex items-center gap-2">
            <CSVImportExport type="crew" />
            <CreateCrewDialog />
          </div>
        </div>

        <CrewClient allCrew={crew} defaultGroupByCity={groupByCity} cities={cities} />
      </div>
    </>
  );
}
