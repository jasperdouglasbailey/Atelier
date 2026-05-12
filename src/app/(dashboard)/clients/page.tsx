import Topbar from '@/components/layout/Topbar';
import { listClients } from '@/lib/data/entities';
import CreateClientDialog from '@/components/entities/CreateClientDialog';
import ClientsClient from '@/components/clients/ClientsClient';

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <Topbar title="Clients" />
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div />
          <CreateClientDialog />
        </div>

        <ClientsClient allClients={clients} />
      </div>
    </>
  );
}
