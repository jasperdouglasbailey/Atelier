'use server';

import { revalidatePath } from 'next/cache';
import { createLocation, getLocation, updateLocation } from '@/lib/data/locations';
import { createLocationFolder, createLocationFolderWithRooms } from '@/lib/integrations/drive';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { geocodeAddress } from '@/lib/integrations/geocode';
import { parseLocationFromUrl, type ParsedLocation } from '@/lib/automation/location-parser';
import { checkKillSwitch } from '@/lib/utils/kill-switch';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { logAudit } from '@/lib/utils/audit';
import { getCurrentActor } from '@/lib/utils/actor';
import type { StudioType, StudioRoom, Location } from '@/lib/types/database';

async function requireOwnerOrPartner(): Promise<{ error: string } | null> {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return { error: 'Forbidden' };
  return null;
}

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

// Helper — assemble the address string we'll geocode against. Used to detect
// whether geocoding needs to re-run (address changed) and as the search query.
function addressKey(loc: { address?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null }): string {
  return [loc.address, loc.suburb, loc.state, loc.postcode]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(', ');
}

/**
 * Background sync — geocode the location's address and create/update its
 * Drive folder + per-room subfolders. Run after every create/update so the
 * map and Drive structure stay in sync with the form input.
 *
 * Non-fatal — any failure here is logged but doesn't abort the save.
 */
async function syncLocationSideEffects(
  loc: Location,
  input: Record<string, unknown>,
): Promise<void> {
  // 1) Geocoding — only when the address actually changed (or never geocoded)
  const newKey = addressKey(input as Parameters<typeof addressKey>[0]);
  const lastKey = loc.geocoded_address ?? '';
  if (newKey && newKey !== lastKey) {
    try {
      const result = await geocodeAddress(input as Parameters<typeof geocodeAddress>[0]);
      if (result) {
        await updateLocation(loc.id, {
          latitude: result.latitude,
          longitude: result.longitude,
          geocoded_address: newKey,
        });
      } else {
        // Persist the attempted address so we don't keep retrying every save.
        await updateLocation(loc.id, { geocoded_address: newKey });
      }
    } catch (err) {
      console.error(`[locations] Geocoding failed for ${loc.name} (non-fatal):`, err);
    }
  }

  // 2) Drive folder + room subfolders — idempotent. Run on every save so
  //    new rooms added later auto-create their subfolders.
  try {
    const studioRooms = ((input.studio_rooms as StudioRoom[] | null) ?? loc.studio_rooms ?? []) as StudioRoom[];
    const roomNames = studioRooms.map((r) => r.name).filter((n): n is string => Boolean(n && n.trim()));

    if (roomNames.length > 0) {
      const { parent } = await createLocationFolderWithRooms(loc.name, roomNames);
      if (parent && (loc.drive_folder_id !== parent.id || loc.drive_folder_link !== parent.webViewLink)) {
        await updateLocation(loc.id, {
          drive_folder_id: parent.id,
          drive_folder_link: parent.webViewLink,
        });
      }
    } else if (!loc.drive_folder_id) {
      // No rooms; just ensure the parent folder exists.
      const driveFolder = await createLocationFolder(loc.name);
      if (driveFolder) {
        await updateLocation(loc.id, {
          drive_folder_id: driveFolder.id,
          drive_folder_link: driveFolder.webViewLink,
        });
      }
    }
  } catch (err) {
    console.error('[locations] Drive sync failed (non-fatal):', err);
  }
}

export async function createLocationAction(formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const input = formToLocationInput(formData);
  const name = input.name as string;
  if (!name) return { error: 'Name is required' };

  const result = await createLocation({ ...input, name });
  if (!result) return { error: 'Failed to create location' };

  await logAudit({ userId: await getCurrentActor(), action: 'create', tableName: 'atelier_locations', recordId: result.id, newValue: { name } as never });

  await syncLocationSideEffects(result, input);

  revalidatePath('/locations');
  return { ok: true, id: result.id };
}

export async function updateLocationAction(id: string, formData: FormData) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
  const input = formToLocationInput(formData);
  const result = await updateLocation(id, input);
  if (!result) return { error: 'Failed to update location' };

  await logAudit({ userId: await getCurrentActor(), action: 'update', tableName: 'atelier_locations', recordId: id, newValue: input as never });

  await syncLocationSideEffects(result, input);

  revalidatePath('/locations');
  revalidatePath(`/locations/${id}`);
  return { ok: true };
}

/**
 * AI-parse a studio's website into structured location fields. Returns the
 * parsed values WITHOUT persisting them — the form layer shows them to the
 * user for review before save (doctrine: never auto-apply LLM output).
 *
 * Kill-switch: blocked at RED (no agent activity at all). AMBER is allowed
 * because parsing is a read-only LLM call — no outbound effects.
 *
 * Audit-logged as `location_website_parse` with the source URLs + confidence.
 */
export async function parseLocationFromUrlAction(
  rawUrl: string,
): Promise<{ ok: true; parsed: ParsedLocation } | { ok: false; error: string }> {
  const authError = await requireOwnerOrPartner();
  if (authError) return { ok: false, error: authError.error };

  const ks = await checkKillSwitch();
  if (!ks.canProceed) {
    return { ok: false, error: 'Kill switch is RED — agent activity is paused.' };
  }

  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Please provide a website URL.' };

  const parsed = await parseLocationFromUrl(trimmed);
  if (!parsed) {
    return { ok: false, error: 'Could not parse this URL. The site may have blocked scraping, returned no usable HTML, or the LLM is unavailable.' };
  }

  await logAudit({
    userId: await getCurrentActor(),
    action: 'location_website_parse',
    tableName: 'atelier_locations',
    recordId: null,
    newValue: {
      url: trimmed,
      sourceUrls: parsed.sourceUrls,
      confidence: parsed.confidence,
      uncertainty: parsed.uncertainty,
    } as never,
  });

  return { ok: true, parsed };
}

/**
 * Retry creating the Google Drive folder for a location whose initial create
 * skipped Drive (no credentials at the time, or transient API error).
 * Idempotent — `createLocationFolder` finds an existing folder by name first.
 */
export async function retryLocationDriveFolderAction(id: string) {
  const authError = await requireOwnerOrPartner();
  if (authError) return authError;
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
