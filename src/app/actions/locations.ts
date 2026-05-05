'use server';

import { revalidatePath } from 'next/cache';
import { createLocation, getLocation, updateLocation } from '@/lib/data/locations';
import { createLocationFolder } from '@/lib/integrations/drive';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import type { StudioType, StudioRoom } from '@/lib/types/database';

const TEXT_FIELDS = [
  'name', 'alias', 'address', 'suburb', 'state', 'postcode',
  'contact_name', 'contact_email', 'contact_phone', 'website',
  'rate_notes', 'parking_notes', 'access_notes', 'notes',
] as const;

const NUM_FIELDS = [
  'half_day_rate', 'full_day_rate', 'weekend_surcharge_pct',
  'square_metres', 'max_capacity',
] as const;

function formToLocationInput(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    const v = fd.get(f) as string | null;
    out[f] = v || null;
  }
  for (const f of NUM_FIELDS) {
    const v = fd.get(f) as string | null;
    out[f] = v ? Number(v) : null;
  }
  out.studio_type = (fd.get('studio_type') as StudioType) || 'photo_studio';
  out.is_active = fd.get('is_active') !== 'false';

  // Facilities are sent as a JSON array string from the checkbox group
  const facilitiesRaw = fd.get('facilities');
  if (facilitiesRaw) {
    try { out.facilities = JSON.parse(facilitiesRaw as string); } catch { out.facilities = null; }
  }

  // Studio rooms — JSON array from the form
  const roomsRaw = fd.get('studio_rooms');
  if (roomsRaw) {
    try { out.studio_rooms = JSON.parse(roomsRaw as string) as StudioRoom[]; } catch { out.studio_rooms = null; }
  }

  return out;
}

export async function createLocationAction(formData: FormData) {
  const input = formToLocationInput(formData);
  const name = input.name as string;
  if (!name) return { error: 'Name is required' };

  const result = await createLocation({ ...input, name });
  if (!result) return { error: 'Failed to create location' };

  // Auto-create Google Drive folder (non-blocking — failure doesn't abort creation)
  try {
    const driveFolder = await createLocationFolder(name);
    if (driveFolder) {
      await updateLocation(result.id, {
        drive_folder_id: driveFolder.id,
        drive_folder_link: driveFolder.webViewLink,
      });
    }
  } catch (err) {
    console.error('[locations] Drive folder creation failed (non-fatal):', err);
  }

  revalidatePath('/locations');
  return { ok: true, id: result.id };
}

export async function updateLocationAction(id: string, formData: FormData) {
  const input = formToLocationInput(formData);
  const result = await updateLocation(id, input);
  if (!result) return { error: 'Failed to update location' };

  revalidatePath('/locations');
  revalidatePath(`/locations/${id}`);
  return { ok: true };
}

/**
 * Retry creating the Google Drive folder for a location whose initial create
 * skipped Drive (no credentials at the time, or transient API error).
 * Idempotent — `createLocationFolder` finds an existing folder by name first.
 */
export async function retryLocationDriveFolderAction(id: string) {
  if (!isGoogleConfigured()) {
    return { error: 'Google Drive is not configured. Set GOOGLE_REFRESH_TOKEN first.' };
  }

  const loc = await getLocation(id);
  if (!loc) return { error: 'Location not found' };

  const folder = await createLocationFolder(loc.name);
  if (!folder) return { error: 'Drive folder creation failed. Check server logs.' };

  await updateLocation(id, {
    drive_folder_id: folder.id,
    drive_folder_link: folder.webViewLink,
  });

  revalidatePath(`/locations/${id}`);
  revalidatePath('/locations');
  return { ok: true, link: folder.webViewLink };
}
