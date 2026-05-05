/**
 * App-user (role) management.
 *
 * Wraps atelier_app_users — the table that maps an auth.users row to a
 * role (owner / partner / talent / crew) plus optional linkage to a
 * domain entity (talent_id or crew_id).
 *
 * Reads use the regular client (RLS allows owner/partner/self).
 * Writes use the service client because the partner-management UI
 * operates on rows that the caller may not have permission to update
 * directly (owner provisioning a partner, etc.).
 */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { reportDataError } from '@/lib/utils/data-errors';

export type AppRole = 'owner' | 'partner' | 'talent' | 'crew';

export type AppUser = {
  user_id: string;
  role: AppRole;
  display_name: string | null;
  talent_id: string | null;
  crew_id: string | null;
  is_active: boolean;
  created_at: string;
  invited_at: string | null;
  last_seen_at: string | null;
};

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('atelier_app_users')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    reportDataError('[app-users] current user', error);
    return null;
  }
  return (data as AppUser | null) ?? null;
}

export async function listAppUsers(): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_app_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    reportDataError('[app-users] list', error);
    return [];
  }
  return (data ?? []) as AppUser[];
}

export type CreateAppUserInput = {
  user_id: string;
  role: AppRole;
  display_name?: string | null;
  talent_id?: string | null;
  crew_id?: string | null;
};

export async function createAppUser(input: CreateAppUserInput): Promise<AppUser | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('atelier_app_users')
    .insert({
      user_id: input.user_id,
      role: input.role,
      display_name: input.display_name ?? null,
      talent_id: input.role === 'talent' ? input.talent_id ?? null : null,
      crew_id: input.role === 'crew' ? input.crew_id ?? null : null,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    reportDataError('[app-users] create', error);
    return null;
  }
  return data as AppUser;
}

export async function setAppUserActive(userId: string, isActive: boolean): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('atelier_app_users')
    .update({ is_active: isActive })
    .eq('user_id', userId);

  if (error) {
    reportDataError('[app-users] toggle active', error);
    return false;
  }
  return true;
}

export async function deleteAppUser(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('atelier_app_users')
    .delete()
    .eq('user_id', userId);

  if (error) {
    reportDataError('[app-users] delete', error);
    return false;
  }
  return true;
}
