/**
 * Google Drive Integration Stub
 *
 * Handles: file delivery to clients, selects retrieval, asset management.
 * Each booking gets a standard folder structure under a top-level Atelier
 * folder. The folder layout matches the previous Dropbox layout exactly,
 * so existing process docs / muscle memory still apply.
 *
 * Setup: shares OAuth credentials with Gmail and Calendar — see google-auth.ts.
 * The `drive.file` scope limits the app to files it created itself. This is
 * a deliberate trade — if Jasper drops files into a booking folder via the
 * Drive web UI, the app can still see them (because they're inside an
 * app-created folder), but the app CANNOT see arbitrary other Drive content.
 *
 * Real implementation will use:
 *   - Drive REST API: https://www.googleapis.com/drive/v3/files
 *   - Folder = file with mimeType 'application/vnd.google-apps.folder'
 *   - Sharing: POST /files/{id}/permissions with role='reader', type='anyone'
 *     produces a shareable link suitable for client delivery
 *   - For uploads: multipart upload (small files <5MB) or resumable (larger)
 */

import { isGoogleConfigured } from './google-auth';

export interface DriveFolderStructure {
  root: string;           // e.g. "Saunders & Co / 2026 / AJE eComm #3579"
  briefs: string;         // .../Briefs
  selects: string;        // .../Selects
  retouched: string;      // .../Retouched
  finals: string;         // .../Finals — Delivered
  admin: string;          // .../Admin (call sheets, releases)
}

/** Create the standard booking folder structure in Drive. */
export async function createBookingFolders(bookingRef: string, year: number): Promise<DriveFolderStructure> {
  // Path-style identifiers for logging / display. The actual API uses
  // file IDs, but we surface a friendly hierarchy in the booking record.
  const root = `Saunders & Co/${year}/${bookingRef}`;
  const structure: DriveFolderStructure = {
    root,
    briefs: `${root}/Briefs`,
    selects: `${root}/Selects`,
    retouched: `${root}/Retouched`,
    finals: `${root}/Finals — Delivered`,
    admin: `${root}/Admin`,
  };

  if (!isGoogleConfigured()) {
    console.log('[drive] CREATE FOLDERS (stub — no credentials)', JSON.stringify(structure, null, 2));
    return structure;
  }

  // TODO: POST 6 folder creates to /drive/v3/files with mimeType
  // 'application/vnd.google-apps.folder' and parents=[parentId]. Top-level
  // "Saunders & Co" folder is created once; year folders are created per
  // year; booking folder + 5 children are created per booking. Persist the
  // resulting Drive file IDs on atelier_bookings (e.g. drive_root_id).
  console.log('[drive] CREATE FOLDERS (not yet implemented)', bookingRef);
  return structure;
}

/** Create a publicly-shareable link for client delivery. */
export async function createSharedLink(path: string): Promise<string> {
  if (!isGoogleConfigured()) {
    console.log('[drive] CREATE SHARED LINK (stub — no credentials)', path);
    return `https://drive.google.com/drive/folders/stub-${encodeURIComponent(path)}`;
  }

  // TODO: POST /drive/v3/files/{fileId}/permissions
  //   body: { role: 'reader', type: 'anyone' }
  // then GET /drive/v3/files/{fileId}?fields=webViewLink to retrieve the URL.
  console.log('[drive] CREATE SHARED LINK (not yet implemented)', path);
  return `https://drive.google.com/drive/folders/stub-${encodeURIComponent(path)}`;
}

/** Upload a file to a specific folder. */
export async function uploadFile(
  path: string,
  _contents: Buffer | Uint8Array,
  _mimeType?: string,
): Promise<string> {
  if (!isGoogleConfigured()) {
    console.log('[drive] UPLOAD FILE (stub — no credentials)', path);
    return `drive-file-stub-${Date.now()}`;
  }

  // TODO: multipart upload to https://www.googleapis.com/upload/drive/v3/files
  //   ?uploadType=multipart with metadata + media parts.
  // For files >5MB, switch to resumable uploads (uploadType=resumable).
  console.log('[drive] UPLOAD FILE (not yet implemented)', path);
  return `drive-file-stub-${Date.now()}`;
}

/** List files in a folder. */
export async function listFiles(path: string): Promise<{
  name: string;
  path: string;
  size: number;
  modified: string;
}[]> {
  if (!isGoogleConfigured()) {
    console.log('[drive] LIST FILES (stub — no credentials)', path);
    return [];
  }

  // TODO: GET /drive/v3/files?q='{folderId}' in parents&fields=...
  console.log('[drive] LIST FILES (not yet implemented)', path);
  return [];
}
