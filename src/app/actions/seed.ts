'use server';

import { revalidatePath } from 'next/cache';
import { seedMockCosts } from '@/lib/utils/seed-costs';

export async function seedMockCostsAction(replace = false) {
  const result = await seedMockCosts({ count: 50, replace });
  revalidatePath('/costs');
  return result;
}
