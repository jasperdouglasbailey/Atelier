'use server';

import { revalidatePath } from 'next/cache';
import { setKillSwitch, getKillSwitchState } from '@/lib/utils/kill-switch';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { getCurrentAppUser } from '@/lib/data/app-users';

/**
 * Toggle the platform-wide kill switch.
 *
 * SECURITY — owner / partner only. Any authenticated user could
 * previously flip the kill switch (P0 finding, 2026-05-16 audit).
 * Talent and crew portal users now get a forbidden error.
 *
 * Returns `null` on auth failure so existing call sites (which already
 * tolerate null from `setKillSwitch`) degrade gracefully. The audit
 * log captures the attempted breach.
 */
export async function toggleKillSwitchAction(field: 'is_active' | 'pause_outbound') {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    // Record the attempt — security-relevant. logAuditFailure writes the
    // <action>_failed row so it stands out in the audit log.
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: `kill_switch.${field}.toggle`,
      tableName: 'atelier_kill_switch',
      attempted: { field, role: appUser?.role ?? 'unauthenticated' },
      error: 'Forbidden — owner or partner role required.',
    });
    return null;
  }

  const current = await getKillSwitchState();
  const next = !(current?.[field] ?? false);
  const patch = { [field]: next } as { is_active?: boolean; pause_outbound?: boolean };

  const updated = await setKillSwitch(patch);
  const userId = await getCurrentActor();

  await logAudit({
    userId,
    action: next ? `kill_switch.${field}.enable` : `kill_switch.${field}.disable`,
    tableName: 'atelier_kill_switch',
    recordId: updated?.id ?? null,
    oldValue: current ? { [field]: current[field] } : null,
    newValue: { [field]: next },
  });

  revalidatePath('/', 'layout');
  return updated;
}
