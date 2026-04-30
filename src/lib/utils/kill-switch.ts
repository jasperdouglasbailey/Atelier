import { createClient } from '@/lib/supabase/server';

export type KillSwitchState = {
  id: string;
  is_active: boolean;
  pause_outbound: boolean;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Reads the singleton kill_switch row. Returns null on any failure
 * (e.g. table empty) so agent code can default to a safe stance.
 */
export async function getKillSwitchState(): Promise<KillSwitchState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('kill_switch')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as KillSwitchState;
}

/**
 * Returns the gating signals every agent action should consult:
 *   canProceed       — false when the red switch is active (full freeze)
 *   canSendOutbound  — false when either switch is active (block sends, but
 *                      drafting is still allowed when only amber is on)
 *
 * Fail-safe: if state can't be read, both flags fall back to false.
 */
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

/**
 * Toggle helper used by the Topbar buttons. Updates the singleton row
 * and returns the new state.
 */
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
    // First-run safety: insert a row if the table is empty
    const { data, error } = await supabase
      .from('kill_switch')
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
    .from('kill_switch')
    .update(update)
    .eq('id', current.id)
    .select()
    .single();

  if (error) return null;
  return data as KillSwitchState;
}
