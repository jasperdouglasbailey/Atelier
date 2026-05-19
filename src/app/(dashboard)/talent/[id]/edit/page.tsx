import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import TalentEditForm from '@/components/entities/TalentEditForm';
import { getTalent } from '@/lib/data/entities';
import { listAppUsers } from '@/lib/data/app-users';
import { PALETTE } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function TalentEditPage({ params }: Props) {
  const { id } = await params;
  const [talent, appUsers] = await Promise.all([
    getTalent(id),
    listAppUsers(),
  ]);
  if (!talent) notFound();

  // Agents who can own this artist: owner + partner roles, active only.
  // Sorted by display_name for predictable dropdown ordering.
  const agents = appUsers
    .filter((u) => u.is_active && (u.role === 'owner' || u.role === 'partner'))
    .map((u) => ({ user_id: u.user_id, display_name: u.display_name, role: u.role }))
    .sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));

  return (
    <>
      <Topbar title={`Edit · ${talent.working_name}`} />
      <div className="p-4 sm:p-6 max-w-2xl space-y-4">
        <Link href={`/talent/${id}`} className="text-xs" style={{ color: PALETTE.accent }}>
          ← {talent.working_name}
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Edit Talent</h1>
        <TalentEditForm talent={talent} agents={agents} />
      </div>
    </>
  );
}
