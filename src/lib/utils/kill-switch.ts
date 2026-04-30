import { createClient } from '@/lib/supabase/server';
import type { KillSwitchState } from '@/lib/types/database';

const TABLE = 'atelier_kill_switch';

export type { KillSwitchState };

export async function getKillSwitchState(): Promise<KillSwitchState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as KillSwitchState;
}

export async function checkKillSwitch(): Promise<{
  canProceed: boolean;
  canSendOutbound: boolean;
}> {
  const state = await getKillSwitchState();
  if (!state) return { canProceed: false, canSendOutbound: false };
  const canProceed = !state.is_active;
  const canSendOutbound = canProceed && !state.pause_outbound;
  return { canProceed, canSendOutbound };
}

export async function setKillSwitch(
  patch: { is_active?: boolean; pause_outbound?: boolean },
  userId: string | null = null,
): Promise<KillSwitchState | null> {
  const supabase = await createClient();
  const current = await getKillSwitchState();

  const update = {
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  if (!current) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        is_active: patch.is_active ?? false,
        pause_outbound: patch.pause_outbound ?? false,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) return null;
    return data as KillSwitchState;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', current.id)
    .select()
    .single();

  if (error) return null;
  return data as KillSwitchState;
}
