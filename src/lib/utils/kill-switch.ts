/**
 * Kill switch — three states (Red / Amber / Green) per doctrine.
 *
 *   GREEN  → normal operation. Agents draft AND send. Signals scan.
 *   AMBER  → agents draft internally, signals scan, NOTHING SENDS EXTERNALLY.
 *            Outbound integrations and outbound emails are blocked.
 *   RED    → total freeze. All agents stop. All tasks deferred. All outbound held.
 *            Banner on every screen. Only Jasper or partner can resume.
 *
 * The two underlying booleans `is_active` (red) and `pause_outbound` (amber)
 * compose cleanly:
 *   is_active=true                → RED
 *   is_active=false, pause=true   → AMBER
 *   is_active=false, pause=false  → GREEN
 */

import { createClient } from '@/lib/supabase/server';
import type { KillSwitchState } from '@/lib/types/database';

const TABLE = 'atelier_kill_switch';

export type { KillSwitchState };

export type KillSwitchLevel = 'green' | 'amber' | 'red';

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

/**
 * Returns the named level. Use this for UI banners and human-readable logs.
 * Defaults to 'red' if state can't be read — fail closed, never silently proceed.
 */
export function levelOf(state: KillSwitchState | null): KillSwitchLevel {
  if (!state) return 'red';
  if (state.is_active) return 'red';
  if (state.pause_outbound) return 'amber';
  return 'green';
}

export async function getKillSwitchLevel(): Promise<KillSwitchLevel> {
  return levelOf(await getKillSwitchState());
}

export async function checkKillSwitch(): Promise<{
  level: KillSwitchLevel;
  canProceed: boolean;        // false on RED only
  canSendOutbound: boolean;   // false on RED or AMBER
}> {
  const state = await getKillSwitchState();
  const level = levelOf(state);
  return {
    level,
    canProceed: level !== 'red',
    canSendOutbound: level === 'green',
  };
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
