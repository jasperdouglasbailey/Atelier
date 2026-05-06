'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseCsv } from '@/lib/utils/csv';
import {
  titleCaseName, normaliseEmail, normalisePhoneForMatch, parseDietaryDrinkFromNotes,
} from '@/lib/utils/name-format';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import type { ArtistDiscipline, CrewTier } from '@/lib/types/database';

export type ImportResult = {
  inserted: number;
  skipped: number;
  errors: string[];
};

const VALID_DISCIPLINES = new Set<string>([
  'photographer', 'videographer', 'wardrobe_stylist', 'hair', 'makeup', 'hair_and_makeup', 'manicurist',
]);

const VALID_CREW_TIERS = new Set<string>([
  'preferred_core', 'regular_freelance', 'never_again',
]);

/**
 * Build a fast in-memory duplicate index over existing rows.
 * A row is considered a duplicate if any of:
 *   - Same lowercased name
 *   - Same lowercased email (when both provided)
 *   - Same digits-only mobile (when both provided)
 */
type DupIndex = {
  byName: Set<string>;
  byEmail: Set<string>;
  byPhone: Set<string>;
};

function buildDupIndex(existing: Array<{ name?: string | null; working_name?: string | null; email: string | null; mobile: string | null }>): DupIndex {
  const byName = new Set<string>();
  const byEmail = new Set<string>();
  const byPhone = new Set<string>();
  for (const row of existing) {
    const n = (row.name ?? row.working_name ?? '').trim().toLowerCase();
    if (n) byName.add(n);
    const e = normaliseEmail(row.email);
    if (e) byEmail.add(e);
    const p = normalisePhoneForMatch(row.mobile);
    if (p) byPhone.add(p);
  }
  return { byName, byEmail, byPhone };
}

function findDuplicate(
  index: DupIndex,
  name: string,
  email: string | null,
  mobile: string | null,
): string | null {
  const n = name.trim().toLowerCase();
  if (n && index.byName.has(n)) return 'name';
  const e = normaliseEmail(email);
  if (e && index.byEmail.has(e)) return 'email';
  const p = normalisePhoneForMatch(mobile);
  if (p && index.byPhone.has(p)) return 'mobile';
  return null;
}

/**
 * Import talent from a CSV string.
 * Required columns: (working_name OR name), discipline.
 *
 * Names are title-cased on insert ("MASON MACKENZIE WOOD" → "Mason Mackenzie Wood").
 * If a CSV row matches an existing record by name, email, or mobile, the row is
 * flagged as duplicate and skipped (NOT inserted).
 *
 * If the CSV has no `discipline` column at all, returns a single redirect-style
 * error pointing the user at the Crew Import button.
 */
export async function importTalentAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (rows.length > 0) {
    const hasAnyName = rows.some((r) => (r['working_name'] || r['name'])?.trim());
    const hasAnyDiscipline = rows.some((r) => r['discipline']?.trim());
    if (hasAnyName && !hasAnyDiscipline) {
      return {
        inserted: 0,
        skipped: rows.length,
        errors: [
          'This CSV has no `discipline` column — it looks like a crew list. ' +
          'Use the Import CSV button on the Crew page instead.',
        ],
      };
    }
  }

  // Pre-load existing talent for duplicate detection
  const { data: existing } = await supabase
    .from('atelier_talent')
    .select('working_name, email, mobile');
  const dupIndex = buildDupIndex(existing ?? []);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawName = (row['working_name'] || row['name'])?.trim();
    const discipline = row['discipline']?.trim()?.toLowerCase();

    if (!rawName) { skipped++; continue; }

    const workingName = titleCaseName(rawName);

    if (!discipline || !VALID_DISCIPLINES.has(discipline)) {
      const expected = Array.from(VALID_DISCIPLINES).join(' | ');
      errors.push(
        `Row ${rowNum} "${workingName}": discipline must be one of [${expected}] (got "${discipline ?? ''}")`,
      );
      skipped++;
      continue;
    }

    const email = row['email']?.trim() || null;
    const mobile = row['mobile']?.trim() || null;
    const dup = findDuplicate(dupIndex, workingName, email, mobile);
    if (dup) {
      errors.push(`Row ${rowNum} "${workingName}": duplicate ${dup} — already exists in talent. Skipped.`);
      skipped++;
      continue;
    }

    const gstRaw = row['gst_registered']?.toLowerCase();
    const activeRaw = row['is_active']?.toLowerCase();
    const dayRateRaw = row['default_day_rate'];

    // Parse Dietary: / Drink: out of the notes if dedicated columns aren't provided
    const rawNotes = row['notes']?.trim() || null;
    const explicitDietary = row['dietary']?.trim() || null;
    const explicitDrink = (row['drink_order'] || row['drink'])?.trim() || null;
    const parsed = parseDietaryDrinkFromNotes(rawNotes);
    const dietary = explicitDietary ?? parsed.dietary;
    const drink_order = explicitDrink ?? parsed.drink_order;
    const notes = (explicitDietary || explicitDrink) ? rawNotes : parsed.remainder;

    const record = {
      working_name: workingName,
      legal_name: titleCaseName(row['legal_name']?.trim() || workingName),
      discipline: discipline as ArtistDiscipline,
      specialty: row['specialty']?.trim() || null,
      email,
      mobile,
      city: row['city']?.trim() || null,
      dietary,
      drink_order,
      instagram: row['instagram']?.trim() || null,
      website: row['website']?.trim() || null,
      abn: row['abn']?.trim() || null,
      gst_registered: gstRaw === 'yes' || gstRaw === 'true' || gstRaw === '1',
      entity_type: row['entity_type']?.trim() || null,
      representation_status: row['representation_status']?.trim() || 'exclusive',
      default_day_rate: dayRateRaw ? Number(dayRateRaw) || null : null,
      is_active: activeRaw ? (activeRaw === 'yes' || activeRaw === 'true' || activeRaw === '1') : true,
      notes,
    };

    const { error } = await supabase.from('atelier_talent').insert(record);
    if (error) {
      errors.push(`Row ${rowNum} "${workingName}": ${error.message}`);
    } else {
      inserted++;
      // Add to in-memory dup index so subsequent rows in the same CSV detect intra-CSV dupes too
      dupIndex.byName.add(workingName.toLowerCase());
      if (email) dupIndex.byEmail.add(email.toLowerCase());
      if (mobile) dupIndex.byPhone.add(normalisePhoneForMatch(mobile));
    }
  }

  if (inserted > 0) revalidatePath('/talent');
  await logAudit({
    userId: await getCurrentActor(),
    action: 'bulk_import_talent',
    tableName: 'atelier_talent',
    newValue: { inserted, skipped, error_count: errors.length, total_rows: rows.length },
  }).catch(() => {});
  return { inserted, skipped, errors };
}

/**
 * Import crew from a CSV string.
 * Required column: name (or working_name as fallback).
 *
 * Names are title-cased on insert. Duplicate detection runs on name, email,
 * and mobile against existing crew. Dietary / Drink fields are extracted from
 * the notes column when present in "Dietary: X | Drink: Y" form.
 *
 * Tier defaults to 'regular_freelance' if blank/invalid.
 */
export async function importCrewAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Pre-load existing crew for duplicate detection
  const { data: existing } = await supabase
    .from('atelier_crew')
    .select('name, email, mobile');
  const dupIndex = buildDupIndex(existing ?? []);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawName = (row['name'] || row['working_name'])?.trim();
    if (!rawName) { skipped++; continue; }

    const name = titleCaseName(rawName);
    const email = row['email']?.trim() || null;
    const mobile = row['mobile']?.trim() || null;

    const dup = findDuplicate(dupIndex, name, email, mobile);
    if (dup) {
      errors.push(`Row ${rowNum} "${name}": duplicate ${dup} — already exists in crew. Skipped.`);
      skipped++;
      continue;
    }

    const tierRaw = row['tier']?.trim()?.toLowerCase();
    const tier = VALID_CREW_TIERS.has(tierRaw) ? (tierRaw as CrewTier) : 'regular_freelance';

    const gstRaw = row['gst_registered']?.toLowerCase();
    const activeRaw = row['is_active']?.toLowerCase();
    const dayRateRaw = row['default_day_rate'];

    const rawNotes = row['notes']?.trim() || null;
    const explicitDietary = row['dietary']?.trim() || null;
    const explicitDrink = (row['drink_order'] || row['drink'])?.trim() || null;
    const parsed = parseDietaryDrinkFromNotes(rawNotes);
    const dietary = explicitDietary ?? parsed.dietary;
    const drink_order = explicitDrink ?? parsed.drink_order;
    const notes = (explicitDietary || explicitDrink) ? rawNotes : parsed.remainder;

    const record = {
      name,
      email,
      mobile,
      city: row['city']?.trim() || null,
      dietary,
      drink_order,
      primary_role: row['primary_role']?.trim() || null,
      tier,
      abn: row['abn']?.trim() || null,
      gst_registered: gstRaw === 'yes' || gstRaw === 'true' || gstRaw === '1',
      default_day_rate: dayRateRaw ? Number(dayRateRaw) || null : null,
      is_active: activeRaw ? (activeRaw === 'yes' || activeRaw === 'true' || activeRaw === '1') : true,
      notes,
    };

    const { error } = await supabase.from('atelier_crew').insert(record);
    if (error) {
      errors.push(`Row ${rowNum} "${name}": ${error.message}`);
    } else {
      inserted++;
      dupIndex.byName.add(name.toLowerCase());
      if (email) dupIndex.byEmail.add(email.toLowerCase());
      if (mobile) dupIndex.byPhone.add(normalisePhoneForMatch(mobile));
    }
  }

  if (inserted > 0) revalidatePath('/crew');
  await logAudit({
    userId: await getCurrentActor(),
    action: 'bulk_import_crew',
    tableName: 'atelier_crew',
    newValue: { inserted, skipped, error_count: errors.length, total_rows: rows.length },
  }).catch(() => {});
  return { inserted, skipped, errors };
}
