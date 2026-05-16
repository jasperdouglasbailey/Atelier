'use server';

import { revalidatePath } from 'next/cache';
import { createCampaign } from '@/lib/data/entities';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) {
    return { error: 'Forbidden — owner or partner role required.' };
  }
  return null;
}

export async function createCampaignAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return { error: authError.error };

  const name = formData.get('name') as string;
  if (!name) return { error: 'Name is required' };

  const input = {
    name,
    client_id: (formData.get('client_id') as string) || undefined,
    brand_id: (formData.get('brand_id') as string) || undefined,
    year: formData.get('year') ? Number(formData.get('year')) : undefined,
    season: (formData.get('season') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  };

  const result = await createCampaign(input);
  if (!result) return { error: 'Failed to create campaign' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'create_campaign',
    tableName: 'atelier_campaigns',
    recordId: result.id,
    newValue: input as never,
  }).catch(() => { /* non-fatal — audit failure shouldn't block the workflow */ });

  revalidatePath('/campaigns');
  return { ok: true, id: result.id };
}
