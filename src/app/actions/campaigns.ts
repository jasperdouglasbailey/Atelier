'use server';

import { revalidatePath } from 'next/cache';
import { createCampaign } from '@/lib/data/entities';

export async function createCampaignAction(formData: FormData) {
  const name = formData.get('name') as string;
  if (!name) return { error: 'Name is required' };

  const result = await createCampaign({
    name,
    client_id: (formData.get('client_id') as string) || undefined,
    brand_id: (formData.get('brand_id') as string) || undefined,
    year: formData.get('year') ? Number(formData.get('year')) : undefined,
    season: (formData.get('season') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  });

  if (!result) return { error: 'Failed to create campaign' };

  revalidatePath('/campaigns');
  return { ok: true, id: result.id };
}
