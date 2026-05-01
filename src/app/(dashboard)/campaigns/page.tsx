import Topbar from '@/components/layout/Topbar';
import { listCampaigns } from '@/lib/data/entities';
import { listClients } from '@/lib/data/entities';
import { listBrands } from '@/lib/data/entities';
import CampaignList from '@/components/campaigns/CampaignList';

export default async function CampaignsPage() {
  const [campaigns, clients, brands] = await Promise.all([
    listCampaigns(),
    listClients(),
    listBrands(),
  ]);

  return (
    <>
      <Topbar title="Campaigns" />
      <div className="p-4 sm:p-6">
        <CampaignList campaigns={campaigns} clients={clients} brands={brands} />
      </div>
    </>
  );
}
