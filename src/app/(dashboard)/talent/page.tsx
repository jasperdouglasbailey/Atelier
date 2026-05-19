import { cookies } from 'next/headers';
import Topbar from '@/components/layout/Topbar';
import { listTalent } from '@/lib/data/entities';
import { getCurrentAppUser } from '@/lib/data/app-users';
import CreateTalentDialog from '@/components/entities/CreateTalentDialog';
import CSVImportExport from '@/components/csv/CSVImportExport';
import TalentClient from '@/components/talent/TalentClient';
import ScopePill from '@/components/layout/ScopePill';

type SearchParams = Promise<{ group?: string; scope?: string }>;

export default async function TalentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const groupByCity = params.group !== 'flat';

  // Scope resolution mirrors the bookings page: URL > cookie > 'mine'.
  // Phase 1 multi-agent default — each agent sees their roster first.
  const cookieStore = await cookies();
  const scopeCookie = cookieStore.get('talent_scope_pref')?.value;
  const scope: 'mine' | 'all' =
    params.scope === 'all' ? 'all'
      : params.scope === 'mine' ? 'mine'
      : scopeCookie === 'all' ? 'all'
      : 'mine';
  const currentUser = await getCurrentAppUser();
  const assignedAgentId = scope === 'mine' && currentUser?.user_id
    ? currentUser.user_id
    : undefined;

  const allTalent = await listTalent({ assignedAgentId });

  return (
    <>
      <Topbar title="Talent" />
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <ScopePill
            current={scope}
            cookieKey="talent_scope_pref"
            pathname="/talent"
            preserveParams={params.group ? { group: params.group } : {}}
          />
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
