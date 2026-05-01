import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import CrewEditForm from '@/components/entities/CrewEditForm';
import { getCrewMember } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function CrewEditPage({ params }: Props) {
  const { id } = await params;
  const crew = await getCrewMember(id);
  if (!crew) notFound();

  return (
    <>
      <Topbar title={`Edit · ${crew.name}`} />
      <div className="p-4 sm:p-6 max-w-2xl space-y-4">
        <Link href={`/crew/${id}`} className="text-xs" style={{ color: PALETTE.accent }}>
          ← {crew.name}
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Edit Crew Member</h1>
        <CrewEditForm crew={crew} />
      </div>
    </>
  );
}
