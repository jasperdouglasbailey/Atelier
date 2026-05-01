import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import TalentEditForm from '@/components/entities/TalentEditForm';
import { getTalent } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function TalentEditPage({ params }: Props) {
  const { id } = await params;
  const talent = await getTalent(id);
  if (!talent) notFound();

  return (
    <>
      <Topbar title={`Edit · ${talent.working_name}`} />
      <div className="p-4 sm:p-6 max-w-2xl space-y-4">
        <Link href={`/talent/${id}`} className="text-xs" style={{ color: PALETTE.accent }}>
          ← {talent.working_name}
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Edit Talent</h1>
        <TalentEditForm talent={talent} />
      </div>
    </>
  );
}
