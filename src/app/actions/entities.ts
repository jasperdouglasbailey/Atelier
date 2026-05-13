'use server';

import { revalidatePath } from 'next/cache';
import { createClientRecord, updateClient, createBrand } from '@/lib/data/entities';
import { createTalentRecord, updateTalent } from '@/lib/data/entities';
import { createCrewRecord, updateCrew } from '@/lib/data/entities';
import { createEntityFolder, trashDriveFolder } from '@/lib/integrations/drive';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import { reportDataError } from '@/lib/utils/data-errors';
import { createClient } from '@/lib/supabase/server';
import { titleCaseName } from '@/lib/utils/name-format';
import { getCurrentAppUser } from '@/lib/data/app-users';
import type { CrewTier, ArtistDiscipline, Json } from '@/lib/types/database';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return { error: 'Forbidden' };
  return null;
}

/**
 * Compact entity-mutation audit log helper. Centralised so create/update
 * actions don't drift in shape — every entity write goes through here.
 */
async function auditEntityMutation(args: {
  table: 'atelier_clients' | 'atelier_talent' | 'atelier_crew' | 'atelier_brands';
  recordId: string | null;
  action: 'create' | 'update' | 'archive' | 'reactivate' | 'delete';
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  await logAudit({
    userId: await getCurrentActor(),
    action: args.action,
    tableName: args.table,
    recordId: args.recordId,
    newValue: (args.payload ?? null) as unknown as Json,
  });
}

/**
 * Best-effort Drive folder creation for any entity. Called after the entity
 * row is inserted. Failures are logged but never abort the create — Jasper
 * can retry from the entity detail page later.
 */
async function attachEntityDriveFolder(
  parent: 'Clients' | 'Talent' | 'Crew',
  entityId: string,
  entityName: string,
  tableName: 'atelier_clients' | 'atelier_talent' | 'atelier_crew',
): Promise<void> {
  try {
    const folder = await createEntityFolder(parent, entityName);
    if (!folder) return;

    const { createClient: createSupabase } = await import('@/lib/supabase/server');
    const supabase = await createSupabase();
    await supabase.from(tableName).update({
      drive_folder_id: folder.id,
      drive_folder_link: folder.webViewLink,
    }).eq('id', entityId);
  } catch (err) {
    reportDataError(`[entities] attachEntityDriveFolder(${parent}, ${entityName}) failed`, err);
  }
}

export async function createClientAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const result = await createClientRecord({
    name: titleCaseName(formData.get('name') as string),
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    company: titleCaseName((formData.get('company') as string) || '') || undefined,
    abn: (formData.get('abn') as string) || undefined,
    is_creative_agency: formData.get('is_creative_agency') === 'true',
    payment_terms_days: formData.get('payment_terms_days') ? Number(formData.get('payment_terms_days')) : undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create client' };
  await auditEntityMutation({ table: 'atelier_clients', recordId: result.id, action: 'create', payload: { name: result.name } });
  // Auto-create Drive folder using the company name when present, else contact name
  const folderLabel = (formData.get('company') as string) || result.name;
  await attachEntityDriveFolder('Clients', result.id, folderLabel, 'atelier_clients');
  revalidatePath('/clients');
  return { id: result.id };
}

export async function updateClientAction(id: string, formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const updates: Record<string, unknown> = {};
  for (const [key, val] of formData.entries()) {
    if (key === 'is_creative_agency') updates[key] = val === 'true';
    else if (key === 'payment_terms_days') updates[key] = val ? Number(val) : null;
    else if (key === 'name' || key === 'company') {
      // Title-case names + company on save (manual entry safety net)
      updates[key] = titleCaseName((val as string) || '') || null;
    }
    else if (key === 'contacts') {
      try { updates.contacts = JSON.parse(val as string); } catch { updates.contacts = []; }
    }
    else updates[key] = (val as string) || null;
  }
  const result = await updateClient(id, updates);
  if (!result) return { error: 'Failed to update client' };
  await auditEntityMutation({ table: 'atelier_clients', recordId: id, action: 'update', payload: updates });
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function createBrandAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const result = await createBrand({
    name: titleCaseName(formData.get('name') as string),
    industry: (formData.get('industry') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create brand' };
  await auditEntityMutation({ table: 'atelier_brands', recordId: result.id, action: 'create', payload: { name: result.name } });
  revalidatePath('/clients');
  return { id: result.id, name: result.name };
}

export async function createTalentAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const discipline = formData.get('discipline') as ArtistDiscipline | null;
  if (!discipline) return { error: 'Discipline is required' };

  const result = await createTalentRecord({
    legal_name: titleCaseName(formData.get('legal_name') as string),
    working_name: titleCaseName(formData.get('working_name') as string),
    discipline,
    specialty: (formData.get('specialty') as string) || undefined,
    preferred_comms: (formData.get('preferred_comms') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    mobile: (formData.get('mobile') as string) || undefined,
    pronouns: (formData.get('pronouns') as string) || undefined,
    abn: (formData.get('abn') as string) || undefined,
    gst_registered: formData.get('gst_registered') === 'true',
    entity_type: (formData.get('entity_type') as string) || undefined,
    representation_status: (formData.get('representation_status') as string) || 'exclusive',
    instagram: (formData.get('instagram') as string) || undefined,
    website: (formData.get('website') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create talent' };
  await auditEntityMutation({ table: 'atelier_talent', recordId: result.id, action: 'create', payload: { working_name: result.working_name, discipline } });
  await attachEntityDriveFolder('Talent', result.id, result.working_name, 'atelier_talent');
  revalidatePath('/talent');
  return { id: result.id };
}

export async function createCrewAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const result = await createCrewRecord({
    name: titleCaseName(formData.get('name') as string),
    email: (formData.get('email') as string) || undefined,
    mobile: (formData.get('mobile') as string) || undefined,
    primary_role: (formData.get('primary_role') as string) || undefined,
    tier: (formData.get('tier') as CrewTier) || 'regular_freelance',
    abn: (formData.get('abn') as string) || undefined,
    gst_registered: formData.get('gst_registered') === 'true',
    default_day_rate: formData.get('default_day_rate') ? Number(formData.get('default_day_rate')) : undefined,
    notes: (formData.get('notes') as string) || undefined,
  });
  if (!result) return { error: 'Failed to create crew member' };
  await auditEntityMutation({ table: 'atelier_crew', recordId: result.id, action: 'create', payload: { name: result.name, tier: result.tier } });
  await attachEntityDriveFolder('Crew', result.id, result.name, 'atelier_crew');
  revalidatePath('/crew');
  return { id: result.id };
}

export async function updateCrewAction(id: string, formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const updates: Record<string, unknown> = {};
  // Title-case the name on save (manual entry safety net)
  const rawName = formData.get('name');
  if (rawName !== null) updates.name = titleCaseName((rawName as string) || '') || null;

  const textFields = ['email', 'mobile', 'preferred_comms', 'primary_role', 'tier', 'abn',
    'city', 'dietary', 'drink_order', 'home_address',
    'super_fund_name', 'super_member_number', 'super_usi',
    'kit_list', 'xero_contact_id', 'notes',
    'bank_account_name', 'bank_bsb', 'bank_account_number'];
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = (val as string) || null;
  }
  if (formData.get('gst_registered') !== null) {
    updates.gst_registered = formData.get('gst_registered') === 'true';
  }
  if (formData.get('bank_setup_in_xero') !== null) {
    updates.bank_setup_in_xero = formData.get('bank_setup_in_xero') === 'true';
  }
  for (const rateField of ['default_day_rate', 'min_day_rate', 'max_day_rate']) {
    if (formData.get(rateField) !== null) {
      const v = formData.get(rateField) as string;
      updates[rateField] = v ? Number(v) : null;
    }
  }
  if (formData.get('dob') !== null) {
    const v = formData.get('dob') as string;
    updates.dob = v || null;
  }
  // Comma-separated text → array (certifications stays as text input)
  if (formData.get('certifications') !== null) {
    const v = (formData.get('certifications') as string)?.trim();
    updates.certifications = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
  }
  // secondary_roles comes from checkboxes — getAll() collects every checked value.
  // Always write the field (empty array = no secondary roles) when the form
  // includes the checkbox group (identified by the primary_role field being present).
  if (formData.get('primary_role') !== null) {
    updates.secondary_roles = (formData.getAll('secondary_roles') as string[]).filter(Boolean);
  }
  const result = await updateCrew(id, updates);
  if (!result) return { error: 'Failed to update crew member' };
  await auditEntityMutation({ table: 'atelier_crew', recordId: id, action: 'update', payload: updates });
  revalidatePath('/crew');
  revalidatePath(`/crew/${id}`);
  return { ok: true };
}

/**
 * Hard delete a crew member.
 *
 * Refuses if the crew member has any booking_crew assignments — Jasper must
 * archive (set is_active=false) to preserve the audit trail in those cases.
 * Removing crew with no booking history is safe (e.g. a CSV import duplicate).
 */
export async function deleteCrewAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const supabase = await createClient();
  // Check for booking references
  const { count } = await supabase
    .from('atelier_booking_crew')
    .select('*', { count: 'exact', head: true })
    .eq('crew_id', id);

  if ((count ?? 0) > 0) {
    return {
      error: `Cannot delete: this crew member is assigned to ${count} booking${count === 1 ? '' : 's'}. Archive instead to preserve the audit trail.`,
    };
  }

  await auditEntityMutation({ table: 'atelier_crew', recordId: id, action: 'delete' });

  const { error } = await supabase.from('atelier_crew').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/crew');
  return { ok: true };
}

/**
 * Hard delete a talent. Same rules as crew — refuses if there are booking_talent
 * rows. The doctrine path for archiving is `setTalentActiveAction(id, false)`.
 */
export async function deleteTalentAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const supabase = await createClient();
  const { count } = await supabase
    .from('atelier_booking_talent')
    .select('*', { count: 'exact', head: true })
    .eq('talent_id', id);

  if ((count ?? 0) > 0) {
    return {
      error: `Cannot delete: this talent is assigned to ${count} booking${count === 1 ? '' : 's'}. Archive instead to preserve the audit trail.`,
    };
  }

  await auditEntityMutation({ table: 'atelier_talent', recordId: id, action: 'delete' });

  const { error } = await supabase.from('atelier_talent').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/talent');
  return { ok: true };
}

// ============================================================
// Right to be forgotten — Australian Privacy Principle 11 / 12 / 13
// ============================================================
//
// "Anonymise" — preserve the row + its operational/financial history,
// but null out / replace every PII column. The booking_talent and
// fee_lines references stay intact (so financial reports don't break),
// but the row no longer identifies the person.
//
// This is a one-way operation: the original PII is gone. Only call it
// after a verified APP 12 access request has been fulfilled (the
// person has their data export) AND they've explicitly asked for
// erasure under APP 13.
//
// We don't fully delete because:
//   - Tax records (super, ABN-linked invoices) must be retained for 7 yrs
//   - Audit log integrity (record_id references stay queryable)
//   - Financial reports (revenue/cost attribution) stay accurate
//
// What gets nulled / replaced:
//   - working_name, legal_name → "Anonymised <random8>"
//   - email, mobile, instagram, website, abn, home_address, dob,
//     emergency_*, super_*, passport_*, drivers_licence_*, wwcc_*,
//     visa_*, xero_contact_id, dietary, drink_order, city, notes
//   - is_active → false
//   - onboarding_completed → false (token wiped)
//
// The row itself stays so booking_talent / fee_lines / audit_log keep
// working. Anyone reading those rows sees "Anonymised ab12cd34" instead
// of the real name.

function randomAnonId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function anonymiseTalentAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const anonId = randomAnonId();

  // Fetch the existing Drive folder ID *before* we null it on the row, so
  // we can move the folder to Drive trash. The folder holds portfolio +
  // signed paperwork — leaving it would make the anonymise half-true.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('atelier_talent')
    .select('drive_folder_id')
    .eq('id', id)
    .maybeSingle();
  const driveFolderId = existing?.drive_folder_id ?? null;

  const updates = {
    working_name: `Anonymised ${anonId}`,
    legal_name: `Anonymised ${anonId}`,
    specialty: null,
    preferred_comms: null,
    pronouns: null,
    dob: null,
    mobile: null,
    email: null,
    home_address: null,
    city: null,
    dietary: null,
    drink_order: null,
    emergency_name: null,
    emergency_relationship: null,
    emergency_mobile: null,
    emergency_email: null,
    abn: null,
    super_fund_name: null,
    super_member_number: null,
    super_usi: null,
    passport_expiry: null,
    drivers_licence_expiry: null,
    wwcc_number: null,
    wwcc_expiry: null,
    visa_expiry: null,
    work_rights: null,
    instagram: null,
    website: null,
    xero_contact_id: null,
    drive_folder_id: null,
    drive_folder_link: null,
    notes: null,
    onboarding_completed: false,
    onboarding_token: null,
    onboarding_token_expires_at: null,
    is_active: false,
  };

  const result = await updateTalent(id, updates as never);
  if (!result) return { error: 'Anonymise failed' };

  // APP 13: trash the Drive folder so portfolio / signed paperwork doesn't
  // outlive the database anonymisation. Soft-delete (30-day Drive trash)
  // gives a window to recover from a mis-click.
  const driveTrashed = await trashDriveFolder(driveFolderId);

  await auditEntityMutation({
    table: 'atelier_talent',
    recordId: id,
    action: 'archive',
    payload: {
      reason: 'right_to_be_forgotten',
      anon_id: anonId,
      drive_folder_trashed: driveTrashed,
      drive_folder_id_was: driveFolderId,
    },
  });

  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true, anonId, driveTrashed };
}

export async function anonymiseClientAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const supabase = await createClient();
  const anonId = randomAnonId();

  // Fetch existing Drive folder before null-ing — see talent action above.
  const { data: existing } = await supabase
    .from('atelier_clients')
    .select('drive_folder_id')
    .eq('id', id)
    .maybeSingle();
  const driveFolderId = existing?.drive_folder_id ?? null;

  const { error } = await supabase
    .from('atelier_clients')
    .update({
      name: `Anonymised ${anonId}`,
      company: null,
      email: null,
      phone: null,
      abn: null,
      notes: null,
      preferred_comms: null,
      drive_folder_id: null,
      drive_folder_link: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { error: error.message };

  const driveTrashed = await trashDriveFolder(driveFolderId);

  await auditEntityMutation({
    table: 'atelier_clients',
    recordId: id,
    action: 'archive',
    payload: {
      reason: 'right_to_be_forgotten',
      anon_id: anonId,
      drive_folder_trashed: driveTrashed,
      drive_folder_id_was: driveFolderId,
    },
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { ok: true, anonId, driveTrashed };
}

export async function anonymiseCrewAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const anonId = randomAnonId();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('atelier_crew')
    .select('drive_folder_id')
    .eq('id', id)
    .maybeSingle();
  const driveFolderId = existing?.drive_folder_id ?? null;

  const updates = {
    name: `Anonymised ${anonId}`,
    preferred_comms: null,
    email: null,
    mobile: null,
    city: null,
    dietary: null,
    drink_order: null,
    home_address: null,
    dob: null,
    abn: null,
    super_fund_name: null,
    super_member_number: null,
    super_usi: null,
    xero_contact_id: null,
    drive_folder_id: null,
    drive_folder_link: null,
    notes: null,
    onboarding_completed: false,
    onboarding_token: null,
    onboarding_token_expires_at: null,
    is_active: false,
  };

  const result = await updateCrew(id, updates as never);
  if (!result) return { error: 'Anonymise failed' };

  const driveTrashed = await trashDriveFolder(driveFolderId);

  await auditEntityMutation({
    table: 'atelier_crew',
    recordId: id,
    action: 'archive',
    payload: {
      reason: 'right_to_be_forgotten',
      anon_id: anonId,
      drive_folder_trashed: driveTrashed,
      drive_folder_id_was: driveFolderId,
    },
  });

  revalidatePath('/crew');
  revalidatePath(`/crew/${id}`);
  return { ok: true, anonId, driveTrashed };
}

/**
 * Soft-archive a talent: sets is_active=false. Doctrine: never hard-delete,
 * preserve audit trail. Reactivate via setTalentActiveAction(id, true).
 */
export async function setTalentActiveAction(id: string, active: boolean) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const result = await updateTalent(id, { is_active: active });
  if (!result) return { error: `Failed to ${active ? 'reactivate' : 'archive'} talent` };
  await auditEntityMutation({ table: 'atelier_talent', recordId: id, action: active ? 'reactivate' : 'archive' });
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}

/** Same pattern for crew. */
export async function setCrewActiveAction(id: string, active: boolean) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const result = await updateCrew(id, { is_active: active });
  if (!result) return { error: `Failed to ${active ? 'reactivate' : 'archive'} crew member` };
  await auditEntityMutation({ table: 'atelier_crew', recordId: id, action: active ? 'reactivate' : 'archive' });
  revalidatePath('/crew');
  revalidatePath(`/crew/${id}`);
  return { ok: true };
}

export async function updateTalentAction(id: string, formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const updates: Record<string, unknown> = {};
  // Title-case names on save
  const rawWorking = formData.get('working_name');
  if (rawWorking !== null) updates.working_name = titleCaseName((rawWorking as string) || '') || null;
  const rawLegal = formData.get('legal_name');
  if (rawLegal !== null) updates.legal_name = titleCaseName((rawLegal as string) || '') || null;

  const textFields = ['email', 'mobile', 'pronouns',
    'discipline', 'specialty', 'preferred_comms',
    'city', 'dietary', 'drink_order', 'home_address',
    'abn', 'entity_type', 'representation_status', 'instagram', 'website', 'notes',
    'super_fund_name', 'super_member_number', 'super_usi',
    'emergency_name', 'emergency_relationship', 'emergency_mobile', 'emergency_email',
    'work_rights', 'wwcc_number', 'xero_contact_id',
    'bank_account_name', 'bank_bsb', 'bank_account_number'];
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null) updates[f] = (val as string) || null;
  }
  // Date fields — empty string means clear
  for (const dateField of ['dob', 'visa_expiry', 'passport_expiry', 'drivers_licence_expiry', 'wwcc_expiry']) {
    if (formData.get(dateField) !== null) {
      const v = formData.get(dateField) as string;
      updates[dateField] = v || null;
    }
  }
  for (const rateField of ['default_day_rate', 'min_day_rate', 'max_day_rate']) {
    if (formData.get(rateField) !== null) {
      const v = formData.get(rateField) as string;
      updates[rateField] = v ? Number(v) : null;
    }
  }
  if (formData.get('gst_registered') !== null) {
    updates.gst_registered = formData.get('gst_registered') === 'true';
  }
  if (formData.get('bank_setup_in_xero') !== null) {
    updates.bank_setup_in_xero = formData.get('bank_setup_in_xero') === 'true';
  }
  const result = await updateTalent(id, updates);
  if (!result) return { error: 'Failed to update talent' };
  await auditEntityMutation({ table: 'atelier_talent', recordId: id, action: 'update', payload: updates });
  revalidatePath('/talent');
  revalidatePath(`/talent/${id}`);
  return { ok: true };
}
