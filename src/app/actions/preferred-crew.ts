'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { addPreferredCrew, removePreferredCrew } from '@/lib/data/talent-preferred-crew';
import { logAudit } from '@/lib/utils/audit';

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Add a crew member to a talent's preferred-crew list.
 * Owner/partner only — same gate as managing talent profiles.
 */
export async function addPreferredCrewAction(input: {
  talentId: string;
  crewId: string;
  roleHint?: string;
  notes?: string;
}): Promise<ActionResult> {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { ok: false, error: 'Not authorised' };
  }

  if (!input.talentId || !input.crewId) {
    return { ok: false, error: 'Missing talent or crew id' };
  }

  const result = await addPreferredCrew({
    talentId: input.talentId,
    crewId: input.crewId,
    roleHint: input.roleHint?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (!result) return { ok: false, error: 'Failed to add — already on the list?' };

  await logAudit({
    userId: appUser.user_id,
    action: 'talent_preferred_crew_add',
    tableName: 'atelier_talent_preferred_crew',
    recordId: result.id,
    newValue: { talent_id: input.talentId, crew_id: input.crewId, role_hint: input.roleHint ?? null },
  });

  revalidatePath(`/talent/${input.talentId}`);
  return { ok: true, id: result.id };
}

export async function removePreferredCrewAction(input: {
  id: string;
  talentId: string;
}): Promise<ActionResult> {
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return { ok: false, error: 'Not authorised' };
  }

  const ok = await removePreferredCrew(input.id);
  if (!ok) return { ok: false, error: 'Failed to remove' };

  await logAudit({
    userId: appUser.user_id,
    action: 'talent_preferred_crew_remove',
    tableName: 'atelier_talent_preferred_crew',
    recordId: input.id,
    oldValue: { talent_id: input.talentId },
  });

  revalidatePath(`/talent/${input.talentId}`);
  return { ok: true };
}
