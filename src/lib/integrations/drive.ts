/**
 * Google Drive Integration
 *
 * Each booking gets a standard folder structure under a top-level Atelier
 * folder. Folder layout:
 *
 *   [ROOT_FOLDER_NAME or GOOGLE_DRIVE_ROOT_FOLDER_ID]
 *     └── {year}
 *           └── {bookingRef}
 *                 ├── Briefs
 *                 ├── Selects
 *                 ├── Retouched
 *                 ├── Finals — Delivered
 *                 └── Admin
 *
 * Scope: drive.file — the app can only see/create files it created itself.
 * Year and root folders are found via files.list before creating to avoid
 * duplicates across app restarts.
 *
 * Env:
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID — optional. If set, booking year folders are
 *     created directly under it (Jasper drops files alongside them in Drive).
 *     If not set, the app creates a top-level "Atelier — Saunders & Co" folder
 *     on the first booking and reuses it thereafter.
 */

import { isGoogleConfigured, getAccessToken } from './google-auth';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'Atelier — Saunders & Co';

export interface BookingDriveIds {
  root_id: string;
  folder_ids: {
    briefs: string;
    selects: string;
    retouched: string;
    finals: string;
    admin: string;
  };
  root_link: string;
}

// ── low-level helpers ────────────────────────────────────────────────────────

async function driveGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown');
    throw new Error(`Drive GET ${url}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

async function drivePost<T>(url: string, token: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Drive POST ${url}: ${res.status} ${errBody}`);
  }
  return res.json() as Promise<T>;
}

/** Search for a folder by name inside an optional parent. Returns the first hit's ID or null. */
async function findFolder(token: string, name: string, parentId?: string): Promise<string | null> {
  const clauses = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `mimeType='${FOLDER_MIME}'`,
    `trashed=false`,
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);

  const q = encodeURIComponent(clauses.join(' and '));
  const result = await driveGet<{ files: { id: string }[] }>(
    `${DRIVE_BASE}?q=${q}&fields=files(id)&pageSize=1`,
    token,
  );
  return result.files[0]?.id ?? null;
}

/** Create a folder inside an optional parent. Returns the new folder's ID. */
async function createFolder(token: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  return drivePost<{ id: string; webViewLink: string }>(
    `${DRIVE_BASE}?fields=id,webViewLink`,
    token,
    {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    },
  );
}

/** Find an existing folder or create it. Returns the folder ID. */
async function findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;
  const created = await createFolder(token, name, parentId);
  return created.id;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Create the standard booking folder structure in Drive.
 * On quote_confirmed: call this and persist the returned IDs on the booking row.
 * Degrades gracefully when Google credentials are absent.
 */
export async function createBookingFolders(
  bookingRef: string,
  year: number,
): Promise<BookingDriveIds | null> {
  if (!isGoogleConfigured()) {
    console.log('[drive] CREATE FOLDERS (stub — no credentials)', bookingRef);
    return null;
  }

  const token = await getAccessToken();

  // Resolve or create root folder
  const envRootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const rootId = envRootId ?? await findOrCreateFolder(token, ROOT_FOLDER_NAME);

  // Year subfolder (e.g. "2026")
  const yearId = await findOrCreateFolder(token, String(year), rootId);

  // Booking root folder
  const bookingFolder = await createFolder(token, bookingRef, yearId);
  const bookingRootId = bookingFolder.id;

  // 5 subfolders in parallel
  const [briefsId, selectsId, retouchedId, finalsId, adminId] = await Promise.all([
    findOrCreateFolder(token, 'Briefs', bookingRootId),
    findOrCreateFolder(token, 'Selects', bookingRootId),
    findOrCreateFolder(token, 'Retouched', bookingRootId),
    findOrCreateFolder(token, 'Finals — Delivered', bookingRootId),
    findOrCreateFolder(token, 'Admin', bookingRootId),
  ]);

  // Get the booking root's webViewLink (createFolder returns it)
  const rootLink = bookingFolder.webViewLink;

  const result: BookingDriveIds = {
    root_id: bookingRootId,
    folder_ids: {
      briefs: briefsId,
      selects: selectsId,
      retouched: retouchedId,
      finals: finalsId,
      admin: adminId,
    },
    root_link: rootLink,
  };

  console.log('[drive] CREATED FOLDERS', bookingRef, result.root_id);
  return result;
}

/**
 * Create a publicly-readable shared link for a specific Drive folder.
 * Used on final_delivery to produce a client-delivery URL for the Finals folder.
 * Returns the webViewLink, or null if credentials are absent.
 */
export async function createSharedLink(folderId: string): Promise<string | null> {
  if (!isGoogleConfigured()) {
    console.log('[drive] CREATE SHARED LINK (stub — no credentials)', folderId);
    return null;
  }

  const token = await getAccessToken();

  // Grant anyone-with-link reader access
  await drivePost<unknown>(
    `${DRIVE_BASE}/${folderId}/permissions`,
    token,
    { role: 'reader', type: 'anyone' },
  );

  // Retrieve the shareable link
  const file = await driveGet<{ webViewLink: string }>(
    `${DRIVE_BASE}/${folderId}?fields=webViewLink`,
    token,
  );

  console.log('[drive] SHARED LINK CREATED', folderId, file.webViewLink);
  return file.webViewLink;
}

/**
 * Upload a file to a specific Drive folder.
 * Returns the Drive file ID, or null if credentials are absent.
 */
export async function uploadFile(
  folderId: string,
  filename: string,
  contents: Buffer | Uint8Array,
  mimeType = 'application/octet-stream',
): Promise<string | null> {
  if (!isGoogleConfigured()) {
    console.log('[drive] UPLOAD FILE (stub — no credentials)', filename);
    return null;
  }

  const token = await getAccessToken();

  // Build multipart body (metadata + media)
  const boundary = `-------${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join('\r\n');

  const metaPart = Buffer.from(body, 'utf8');
  const closePart = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const combined = Buffer.concat([metaPart, Buffer.from(contents), closePart]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(combined.length),
      },
      body: combined,
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown');
    throw new Error(`Drive upload ${filename}: ${res.status} ${errBody}`);
  }

  const result = await res.json() as { id: string };
  console.log('[drive] UPLOADED', filename, result.id);
  return result.id;
}

/**
 * List files in a Drive folder (files created by this app only, per drive.file scope).
 */
export async function listFiles(folderId: string): Promise<{
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string;
  webViewLink: string;
}[]> {
  if (!isGoogleConfigured()) {
    console.log('[drive] LIST FILES (stub — no credentials)', folderId);
    return [];
  }

  const token = await getAccessToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const result = await driveGet<{
    files: { id: string; name: string; mimeType: string; size: string | null; modifiedTime: string; webViewLink: string }[];
  }>(
    `${DRIVE_BASE}?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=name`,
    token,
  );
  return result.files;
}

/**
 * Generic helper: create-or-find a Drive folder for an entity under a shared
 * parent folder ("Locations", "Clients", "Talent", "Crew", etc.). The parent
 * itself lives under the app Drive root.
 *
 * Per Rule 9: these Drive folders are for portfolio / reference material only.
 * Sensitive PII (banking details, ID scans, WWCC scans) lives in Supabase
 * Storage, never in Drive.
 *
 * Idempotent — re-saving the same entity returns the existing folder.
 */
export async function createEntityFolder(
  parentName: 'Locations' | 'Clients' | 'Talent' | 'Crew',
  entityName: string,
): Promise<{ id: string; webViewLink: string } | null> {
  if (!isGoogleConfigured()) {
    console.log(`[drive] CREATE ${parentName.toUpperCase()} FOLDER (stub — no credentials)`, entityName);
    return null;
  }

  try {
    const token = await getAccessToken();

    const envRootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    const rootId = envRootId ?? await findOrCreateFolder(token, ROOT_FOLDER_NAME);

    const parentFolderId = await findOrCreateFolder(token, parentName, rootId);

    const existingId = await findFolder(token, entityName, parentFolderId);
    if (existingId) {
      const file = await driveGet<{ webViewLink: string }>(
        `${DRIVE_BASE}/${existingId}?fields=webViewLink`,
        token,
      );
      return { id: existingId, webViewLink: file.webViewLink };
    }

    const folder = await createFolder(token, entityName, parentFolderId);
    console.log(`[drive] CREATED ${parentName.toUpperCase()} FOLDER`, entityName, folder.id);
    return folder;
  } catch (err) {
    console.error(`[drive] createEntityFolder(${parentName}, ${entityName}) failed`, err);
    return null;
  }
}

/** Backwards-compat alias for existing callers. */
export const createLocationFolder = (name: string) => createEntityFolder('Locations', name);

/**
 * Like createLocationFolder, but for multi-room locations: in addition to
 * the parent location folder, ensure a subfolder exists for every named
 * room. Idempotent — re-running on the same rooms is a no-op (uses
 * `findOrCreateFolder` per room).
 *
 * Does NOT delete subfolders for rooms that have been removed from the
 * location — those stay in Drive (the assets may still be useful even
 * if the room is decommissioned). Manual cleanup if Jasper wants them gone.
 *
 * Returns:
 *   - parent: { id, webViewLink } for the location folder (or null if
 *     Drive isn't configured / creation failed)
 *   - rooms: array of { name, id, webViewLink } per successfully created
 *     or found room subfolder
 */
export async function createLocationFolderWithRooms(
  locationName: string,
  roomNames: string[],
): Promise<{
  parent: { id: string; webViewLink: string } | null;
  rooms: Array<{ name: string; id: string; webViewLink: string }>;
}> {
  const parent = await createEntityFolder('Locations', locationName);
  if (!parent) return { parent: null, rooms: [] };

  if (roomNames.length === 0) return { parent, rooms: [] };

  if (!isGoogleConfigured()) {
    return { parent, rooms: [] };
  }

  try {
    const token = await getAccessToken();
    const rooms: Array<{ name: string; id: string; webViewLink: string }> = [];

    for (const rawName of roomNames) {
      const roomName = rawName.trim();
      if (!roomName) continue;

      const existingId = await findFolder(token, roomName, parent.id);
      if (existingId) {
        const file = await driveGet<{ webViewLink: string }>(
          `${DRIVE_BASE}/${existingId}?fields=webViewLink`,
          token,
        );
        rooms.push({ name: roomName, id: existingId, webViewLink: file.webViewLink });
        continue;
      }

      const created = await createFolder(token, roomName, parent.id);
      console.log(`[drive] CREATED LOCATION ROOM FOLDER`, locationName, '/', roomName, created.id);
      rooms.push({ name: roomName, id: created.id, webViewLink: created.webViewLink });
    }

    return { parent, rooms };
  } catch (err) {
    console.error(`[drive] createLocationFolderWithRooms(${locationName}) failed`, err);
    return { parent, rooms: [] };
  }
}

/**
 * Move a Drive folder to the trash. Soft-delete: Drive holds it for 30 days
 * before permanent deletion, so a mistaken anonymise can be undone in that
 * window. Used by the right-to-be-forgotten flow so PII portfolios don't
 * outlive the database row.
 *
 * Returns true if the folder was trashed, false if Google credentials are
 * absent or the folder ID is null/empty. Errors are caught and logged but
 * never thrown — anonymise should always succeed on the database side
 * even if Drive is temporarily unavailable; a failed trash is logged in
 * the audit trail and can be retried by hand.
 */
export async function trashDriveFolder(folderId: string | null | undefined): Promise<boolean> {
  if (!folderId) return false;
  if (!isGoogleConfigured()) {
    console.log('[drive] TRASH FOLDER (stub — no credentials)', folderId);
    return false;
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(`${DRIVE_BASE}/${folderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown');
      console.error(`[drive] trashDriveFolder ${folderId}: ${res.status} ${body}`);
      return false;
    }
    console.log('[drive] TRASHED FOLDER', folderId);
    return true;
  } catch (err) {
    console.error(`[drive] trashDriveFolder(${folderId}) failed`, err);
    return false;
  }
}
