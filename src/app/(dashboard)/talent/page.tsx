import Topbar from '@/components/layout/Topbar';
import { listTalent } from '@/lib/data/entities';
import CreateTalentDialog from '@/components/entities/CreateTalentDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';
import TalentClient from '@/components/talent/TalentClient';

type SearchParams = Promise<{ group?: string }>;

export default async function TalentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const groupByCity = params.group !== 'flat';
  const allTalent = await listTalent();

  return (
    <>
      <Topbar title="Talent" />
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div />
          <div className="flex items-center gap-2">
            <CSVImportExport type="talent" />
            <CreateTalentDialog />
          </div>
        </div>

        <TalentClient allTalent={allTalent} defaultGroupByCity={groupByCity} />
      </div>
    </>
  );
}
