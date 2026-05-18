'use client';

import { useState, useTransition } from 'react';
import { browseDriveAction } from '@/app/actions/drive-picker';
import { driveThumbUrl } from '@/lib/edms/templates';
import { PALETTE } from '@/lib/utils/constants';
import type { EdmImage } from '@/lib/edms/templates';

type Folder = { id: string; name: string };
type ImageHit = {
  id: string;
  name: string;
  thumbnailLink: string | null;
  webViewLink: string | null;
};

type Props = {
  onPick: (img: EdmImage) => void;
  onClose: () => void;
};

export default function DriveImagePicker({ onPick, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [crumbs, setCrumbs] = useState<{ id: string | null; label: string }[]>([
    { id: null, label: 'My Drive' },
  ]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [images, setImages] = useState<ImageHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = crumbs[crumbs.length - 1].id;

  function browse(folder: string | null, q: string, label: string) {
    setError(null);
    startTransition(async () => {
      const result = await browseDriveAction({ folder, query: q });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFolders(result.folders);
      setImages(result.images);
      // Only update crumbs when navigating folders (not on search)
      if (!q) {
        const last = crumbs[crumbs.length - 1];
        if (last.id !== folder) {
          if (folder === null) setCrumbs([{ id: null, label: 'My Drive' }]);
          else setCrumbs((c) => [...c, { id: folder, label }]);
        }
      }
    });
  }

  function pickFile(hit: ImageHit) {
    onPick({ fileId: hit.id, url: driveThumbUrl(hit.id), caption: hit.name });
  }

  // Initial load on mount
  if (folders.length === 0 && images.length === 0 && !error && !pending) {
    browse(null, '', 'My Drive');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg border shadow-xl flex flex-col"
        style={{
          background: PALETTE.surface,
          borderColor: PALETTE.border,
          width: '90vw',
          maxWidth: 900,
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: PALETTE.border }}
        >
          <span style={{ color: PALETTE.text, fontSize: 14, fontWeight: 500 }}>
            Pick an image from Drive
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: PALETTE.muted, cursor: 'pointer', fontSize: 18 }}
            aria-label="Close picker"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-3 border-b" style={{ borderColor: PALETTE.border }}>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  browse(currentFolder, query, '');
                }
              }}
              placeholder="Search image names across all of Drive…"
              className="flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
            <button
              type="button"
              onClick={() => browse(currentFolder, query, '')}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: PALETTE.accent, color: PALETTE.bg, opacity: pending ? 0.6 : 1 }}
            >
              {pending ? '…' : 'Search'}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="Paste Drive folder URL or ID to jump straight there"
              className="flex-1 rounded-md border bg-transparent px-3 py-1.5 text-xs"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
            <button
              type="button"
              onClick={() => {
                if (!folderInput.trim()) return;
                browse(folderInput, '', 'Folder');
                setFolderInput('');
              }}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-xs"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            >
              Open
            </button>
          </div>
          <div className="mt-3 text-xs" style={{ color: PALETTE.muted }}>
            {crumbs.map((c, i) => (
              <span key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setCrumbs(crumbs.slice(0, i + 1));
                    browse(c.id, '', c.label);
                  }}
                  style={{ background: 'transparent', border: 'none', color: PALETTE.muted, cursor: 'pointer', padding: 0 }}
                  className="hover:underline"
                >
                  {c.label}
                </button>
                {i < crumbs.length - 1 && <span> / </span>}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div
              className="rounded-md border p-3 text-xs mb-3"
              style={{ borderColor: PALETTE.danger, color: PALETTE.danger, background: PALETTE.dangerBg }}
            >
              {error}
              {error.toLowerCase().includes('insufficient') || error.toLowerCase().includes('403') ? (
                <div className="mt-1.5">
                  Re-connect Google in Settings — the Drive read scope was added recently and your token may pre-date it.
                </div>
              ) : null}
            </div>
          )}

          {folders.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>
                Folders
              </div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => browse(f.id, '', f.name)}
                    className="text-left rounded-md border px-3 py-2 text-sm transition-colors"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
                  >
                    <span style={{ color: PALETTE.muted, marginRight: 6 }}>▸</span>{f.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {images.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>
                Images {query ? `matching "${query}"` : ''}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => pickFile(img)}
                    className="block rounded-md border overflow-hidden text-left transition-transform hover:scale-[1.02]"
                    style={{ borderColor: PALETTE.border, background: PALETTE.bg }}
                  >
                    <div style={{ aspectRatio: '1/1', background: PALETTE.bg }}>
                      {img.thumbnailLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.thumbnailLink.replace(/=s\d+$/, '=s400')}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : null}
                    </div>
                    <div className="px-2 py-1.5 text-[11px] truncate" style={{ color: PALETTE.muted }}>
                      {img.name}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {!pending && folders.length === 0 && images.length === 0 && !error && (
            <div className="text-sm text-center py-12" style={{ color: PALETTE.muted }}>
              No images or sub-folders here. Use search above, or open a Drive folder.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
