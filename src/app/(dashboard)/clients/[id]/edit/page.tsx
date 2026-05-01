import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ClientEditForm from '@/components/entities/ClientEditForm';
import { getClient } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = { params: Promise<{ id: string }> };

export default async function ClientEditPage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <>
      <Topbar title={`Edit · ${client.name}`} />
      <div className="p-4 sm:p-6 max-w-2xl space-y-4">
        <Link href={`/clients/${id}`} className="text-xs" style={{ color: PALETTE.accent }}>
          ← {client.name}
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Edit Client</h1>
        <ClientEditForm client={client} />
      </div>
    </>
  );
}
