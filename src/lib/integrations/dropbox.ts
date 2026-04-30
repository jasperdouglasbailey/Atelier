/**
 * Dropbox Integration Stub
 *
 * Handles: file delivery to clients, selects retrieval, asset management.
 * Each booking gets a standard folder structure.
 *
 * Setup: Jasper needs to create an OAuth2 app in Dropbox developer console,
 * then store DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN in env.
 */

export interface DropboxFolderStructure {
  root: string;           // e.g. "/Saunders & Co/2026/AJE eComm #3579"
  briefs: string;         // .../Briefs
  selects: string;        // .../Selects
  retouched: string;      // .../Retouched
  finals: string;         // .../Finals — Delivered
  admin: string;          // .../Admin (call sheets, releases)
}

/** Create the standard booking folder structure in Dropbox. */
export async function createBookingFolders(bookingRef: string, year: number): Promise<DropboxFolderStructure> {
  const root = `/Saunders & Co/${year}/${bookingRef}`;
  const structure: DropboxFolderStructure = {
    root,
    briefs: `${root}/Briefs`,
    selects: `${root}/Selects`,
    retouched: `${root}/Retouched`,
    finals: `${root}/Finals — Delivered`,
    admin: `${root}/Admin`,
  };

  console.log('[dropbox] CREATE FOLDERS (stub)', JSON.stringify(structure, null, 2));

  // TODO: Use Dropbox API to create folders
  // const dbx = await getDropboxClient();
  // for (const path of Object.values(structure)) {
  //   await dbx.filesCreateFolderV2({ path, autorename: false });
  // }

  return structure;
}

/** Create a shared link for client delivery. */
export async function createSharedLink(path: string): Promise<string> {
  console.log('[dropbox] CREATE SHARED LINK (stub)', path);

  // TODO: Use Dropbox API
  return `https://www.dropbox.com/sh/stub/${encodeURIComponent(path)}`;
}

/** Upload a file to a specific path. */
export async function uploadFile(path: string, _contents: Buffer | Uint8Array): Promise<string> {
  console.log('[dropbox] UPLOAD FILE (stub)', path);

  return `dropbox-file-stub-${Date.now()}`;
}

/** List files in a folder. */
export async function listFiles(path: string): Promise<{
  name: string;
  path: string;
  size: number;
  modified: string;
}[]> {
  console.log('[dropbox] LIST FILES (stub)', path);

  return [];
}
