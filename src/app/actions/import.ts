'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseCsv } from '@/lib/utils/csv';
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
 * Import talent from a CSV string.
 * Required columns: (working_name OR name), discipline.
 * Other columns optional. Skips rows where the name field is blank.
 * Does NOT upsert — always inserts new rows. Duplicates will result in DB
 * errors which are counted as "errors" in the result.
 *
 * Accepts `name` as a fallback for `working_name` so a crew-style CSV
 * doesn't silently drop every row. If the CSV looks like crew (has names
 * but no discipline column at all), returns an early redirect-style error
 * pointing the user at the Crew Import button.
 */
export async function importTalentAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Detect "this looks like crew, not talent" — every row has a name, no row has a discipline
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    // Accept either `working_name` or `name` as the artist name column
    const workingName = (row['working_name'] || row['name'])?.trim();
    const discipline = row['discipline']?.trim()?.toLowerCase();

    if (!workingName) { skipped++; continue; }

    if (!discipline || !VALID_DISCIPLINES.has(discipline)) {
      const expected = Array.from(VALID_DISCIPLINES).join(' | ');
      errors.push(
        `Row ${rowNum} "${workingName}": discipline must be one of [${expected}] (got "${discipline ?? ''}")`,
      );
      skipped++;
      continue;
    }

    const gstRaw = row['gst_registered']?.toLowerCase();
    const activeRaw = row['is_active']?.toLowerCase();
    const dayRateRaw = row['default_day_rate'];

    const record = {
      working_name: workingName,
      legal_name: row['legal_name']?.trim() || workingName,
      discipline: discipline as ArtistDiscipline,
      specialty: row['specialty']?.trim() || null,
      email: row['email']?.trim() || null,
      mobile: row['mobile']?.trim() || null,
      instagram: row['instagram']?.trim() || null,
      website: row['website']?.trim() || null,
      abn: row['abn']?.trim() || null,
      gst_registered: gstRaw === 'yes' || gstRaw === 'true' || gstRaw === '1',
      entity_type: row['entity_type']?.trim() || null,
      representation_status: row['representation_status']?.trim() || 'exclusive',
      default_day_rate: dayRateRaw ? Number(dayRateRaw) || null : null,
      is_active: activeRaw ? (activeRaw === 'yes' || activeRaw === 'true' || activeRaw === '1') : true,
      notes: row['notes']?.trim() || null,
    };

    const { error } = await supabase.from('atelier_talent').insert(record);
    if (error) {
      errors.push(`Row ${rowNum} "${workingName}": ${error.message}`);
    } else {
      inserted++;
    }
  }

  if (inserted > 0) revalidatePath('/talent');
  return { inserted, skipped, errors };
}

/**
 * Import crew from a CSV string.
 * Required column: name (or working_name as fallback).
 * Tier defaults to 'regular_freelance' if blank/invalid.
 *
 * Accepts `working_name` as a fallback for `name` so an artist-style CSV
 * doesn't silently drop every row.
 */
export async function importCrewAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    // Accept either `name` or `working_name` as the crew name column
    const name = (row['name'] || row['working_name'])?.trim();
    if (!name) { skipped++; continue; }

    const tierRaw = row['tier']?.trim()?.toLowerCase();
    const tier = VALID_CREW_TIERS.has(tierRaw) ? (tierRaw as CrewTier) : 'regular_freelance';

    const gstRaw = row['gst_registered']?.toLowerCase();
    const activeRaw = row['is_active']?.toLowerCase();
    const dayRateRaw = row['default_day_rate'];

    const record = {
      name,
      email: row['email']?.trim() || null,
      mobile: row['mobile']?.trim() || null,
      primary_role: row['primary_role']?.trim() || null,
      tier,
      abn: row['abn']?.trim() || null,
      gst_registered: gstRaw === 'yes' || gstRaw === 'true' || gstRaw === '1',
      default_day_rate: dayRateRaw ? Number(dayRateRaw) || null : null,
      is_active: activeRaw ? (activeRaw === 'yes' || activeRaw === 'true' || activeRaw === '1') : true,
      notes: row['notes']?.trim() || null,
    };

    const { error } = await supabase.from('atelier_crew').insert(record);
    if (error) {
      errors.push(`Row ${rowNum} "${name}": ${error.message}`);
    } else {
      inserted++;
    }
  }

  if (inserted > 0) revalidatePath('/crew');
  return { inserted, skipped, errors };
}
