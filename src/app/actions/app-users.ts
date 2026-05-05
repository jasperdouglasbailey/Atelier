'use server';

import { revalidatePath } from 'next/cache';
import {
  createAppUser,
  setAppUserActive,
  deleteAppUser,
  type AppRole,
} from '@/lib/data/app-users';
import { logAudit, logAuditFailure } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Provision a partner account. Looks up the auth user by email; fails
 * if none exists (the invitee must sign up via the standard /login
 * magic-link flow first, then the owner provisions their role).
 *
 * For talent/crew roles, requires a linkage to the domain entity.
 */
export async function provisionAppUserAction(input: {
  email: string;
  role: AppRole;
  display_name?: string;
  talent_id?: string;
  crew_id?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.email) return { ok: false, error: 'Email is required.' };

  const supabase = createServiceClient();

  // Look up the auth user by email
  const { data: authResp, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    await logAuditFailure({
      userId: await getCurrentActor(),
      action: 'provision_app_user',
      tableName: 'atelier_app_users',
      attempted: { email: input.email, role: input.role } as unknown as import('@/lib/types/database').Json,
      error: authErr.message,
    });
    return { ok: false, error: authErr.message };
  }

  const target = authResp.users.find((u) => u.email?.toLowerCase() === input.email.toLowerCase());
  if (!target) {
    return {
      ok: false,
      error: `No auth user found with email ${input.email}. They must sign in via the magic-link flow at /login first, then come back here to provision their role.`,
    };
  }

  // Validate linkage for talent/crew roles
  if (input.role === 'talent' && !input.talent_id) {
    return { ok: false, error: 'talent_id is required when role is talent.' };
  }
  if (input.role === 'crew' && !input.crew_id) {
    return { ok: false, error: 'crew_id is required when role is crew.' };
  }

  const created = await createAppUser({
    user_id: target.id,
    role: input.role,
    display_name: input.display_name ?? target.email ?? null,
    talent_id: input.talent_id ?? null,
    crew_id: input.crew_id ?? null,
  });

  if (!created) return { ok: false, error: 'Could not provision account.' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'provision_app_user',
    tableName: 'atelier_app_users',
    recordId: target.id,
    newValue: { email: input.email, role: input.role } as unknown as import('@/lib/types/database').Json,
  });

  revalidatePath('/settings/partners');
  return { ok: true };
}

export async function toggleAppUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ok = await setAppUserActive(userId, isActive);
  if (!ok) return { ok: false, error: 'Could not update.' };

  await logAudit({
    userId: await getCurrentActor(),
    action: isActive ? 'activate_app_user' : 'deactivate_app_user',
    tableName: 'atelier_app_users',
    recordId: userId,
    newValue: { is_active: isActive } as unknown as import('@/lib/types/database').Json,
  });

  revalidatePath('/settings/partners');
  return { ok: true };
}

export async function deleteAppUserAction(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ok = await deleteAppUser(userId);
  if (!ok) return { ok: false, error: 'Could not delete.' };

  await logAudit({
    userId: await getCurrentActor(),
    action: 'delete_app_user',
    tableName: 'atelier_app_users',
    recordId: userId,
    oldValue: { user_id: userId } as unknown as import('@/lib/types/database').Json,
  });

  revalidatePath('/settings/partners');
  return { ok: true };
}
