'use server';

import {
  searchDriveImages,
  listImagesInFolder,
  listSubfolders,
  parseDriveFolderId,
  type DriveImageHit,
  type DriveFolder,
} from '@/lib/integrations/drive';
import { getCurrentAppUser } from '@/lib/data/app-users';

async function requireOwnerOrPartner(): Promise<boolean> {
  const user = await getCurrentAppUser();
  return !!user && (user.role === 'owner' || user.role === 'partner');
}

export type DriveBrowseResult = {
  ok: true;
  folders: DriveFolder[];
  images: DriveImageHit[];
} | { ok: false; error: string };

export async function browseDriveAction(input: {
  /** Folder ID, raw folder URL, or null for top-level "My Drive". */
  folder: string | null;
  /** Free-text image-name search. Empty = list folder contents. */
  query: string;
}): Promise<DriveBrowseResult> {
  if (!(await requireOwnerOrPartner())) return { ok: false, error: 'Forbidden' };

  try {
    const q = input.query.trim();
    if (q) {
      const images = await searchDriveImages(q, 40);
      return { ok: true, folders: [], images };
    }

    const folderId = input.folder ? parseDriveFolderId(input.folder) : null;
    const [folders, images] = await Promise.all([
      listSubfolders(folderId),
      folderId ? listImagesInFolder(folderId) : Promise.resolve([] as DriveImageHit[]),
    ]);
    return { ok: true, folders, images };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Drive browse failed';
    return { ok: false, error: msg };
  }
}
