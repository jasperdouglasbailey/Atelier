'use server';

import { revalidatePath } from 'next/cache';
import { setKillSwitch, getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit } from '@/lib/utils/audit';

export async function toggleKillSwitchAction(field: 'is_active' | 'pause_outbound') {
  const current = await getKillSwitchState();
  const next = !(current?.[field] ?? false);
  const patch = { [field]: next } as { is_active?: boolean; pause_outbound?: boolean };

  const updated = await setKillSwitch(patch);

  await logAudit({
    userId: null, // wired up once auth lands
    action: next ? `kill_switch.${field}.enable` : `kill_switch.${field}.disable`,
    tableName: 'kill_switch',
    recordId: updated?.id ?? null,
    oldValue: current ? { [field]: current[field] } : null,
    newValue: { [field]: next },
  });

  revalidatePath('/', 'layout');
  return updated;
}
