'use client';

/**
 * Instagram Grid Planner
 *
 * Phone mockup of @saundersandcoagency's Instagram grid.
 * 3 columns × N rows at 4:5 portrait — IG's standard feed-post aspect.
 * (Reels are 9:16 but only render as 4:5 thumbnails inside the grid.)
 * Stats + handle + display name + avatar fetched live from
 * /api/instagram/profile on mount, with a manual refresh button.
 *
 * What's persisted (survives page refresh):
 *   - Image blobs in IndexedDB (under each slot's stable key)
 *   - Caption / status / label / scheduled date / content type in localStorage
 *
 * What's session-only:
 *   - The File metadata (filename only). The blob itself is durable.
 *
 * COLOUR CONVENTION
 * -----------------
 * The phone mockup uses literal Instagram brand colours (#fafafa, #dbdbdb,
 * #262626, #8e8e8e, #e1306c, #000). Those are INTENTIONAL — they make the
 * preview look like Instagram. Do NOT migrate them to PALETTE.* — PALETTE
 * is the dark Atelier shell.
 *
 * The right-side editor uses PALETTE.* as expected.
 */

import { useRef, useState, useEffect, useCallback, DragEvent, ChangeEvent } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { putImage, deleteImage, clearAllImages, getImageUrl } from './idb-storage';

const GRID_COLS = 3;
const DEFAULT_ROWS = 4;   // 12 slots to start
const PHONE_OUTER_W = 330; // px
const LS_KEY = 'atelier_grid_planner_slots_v2';

type ContentType = 'static' | 'reel' | 'carousel';

type GridSlot = {
  id: string;
  /** IDB key for the image blob. Stable across page reloads. */
  imageKey: string | null;
  /** Live ObjectURL — recreated from the blob on mount. */
  imageUrl: string | null;
  /** File metadata for display only — the actual data lives in IDB. */
  imageName: string | null;
  caption: string;
  status: 'planned' | 'live';
  label: string;
  /** ISO date string (YYYY-MM-DD), or null. */
  scheduledAt: string | null;
  contentType: ContentType;
};

type IGStats = {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  posts: string;
  followers: string;
  following: string;
  fetchedAt: string;
};

function makeSlot(index: number): GridSlot {
  return {
    id: `slot-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    imageKey: null,
    imageUrl: null,
    imageName: null,
    caption: '',
    status: 'planned',
    label: '',
    scheduledAt: null,
    contentType: 'static',
  };
}

function initSlots(count: number): GridSlot[] {
  return Array.from({ length: count }, (_, i) => makeSlot(i));
}

/** Persisted shape — everything except the runtime ObjectURL. */
type PersistedSlot = {
  id: string;
  imageKey: string | null;
  imageName: string | null;
  caption: string;
  status: 'planned' | 'live';
  label: string;
  scheduledAt: string | null;
  contentType: ContentType;
};

function loadPersistedSlots(): PersistedSlot[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSlot[];
  } catch {
    return null;
  }
}

function persistedFromSlots(slots: GridSlot[]): PersistedSlot[] {
  return slots.map((s) => ({
    id: s.id,
    imageKey: s.imageKey,
    imageName: s.imageName,
    caption: s.caption,
    status: s.status,
    label: s.label,
    scheduledAt: s.scheduledAt,
    contentType: s.contentType,
  }));
}

function hydrateSlots(base: GridSlot[], persisted: PersistedSlot[]): GridSlot[] {
  // Rebuild from persisted IDs so reorders survive. Pad with fresh slots if
  // the persisted count is shorter (user added rows previously).
  return persisted.map<GridSlot>((p) => ({
    id: p.id,
    imageKey: p.imageKey,
    imageUrl: null, // hydrated async via IDB after mount
    imageName: p.imageName,
    caption: p.caption ?? '',
    status: p.status ?? 'planned',
    label: p.label ?? '',
    scheduledAt: p.scheduledAt ?? null,
    contentType: p.contentType ?? 'static',
  })).concat(base.slice(persisted.length));
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  static: 'Static',
  reel: 'Reel',
  carousel: 'Carousel',
};

/** Phone frame wrapper — fixed 330 px wide, white IG interior */
function PhoneMockup({
  children,
  stats,
}: {
  children: React.ReactNode;
  stats: IGStats | null;
}) {
  return (
    <div
      className="rounded-[2rem] overflow-hidden shadow-2xl flex-shrink-0"
      style={{ width: PHONE_OUTER_W, border: '5px solid #1a1a1a', background: '#000' }}
    >
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-5 pt-2 pb-1 text-white text-[10px] font-semibold"
        style={{ background: '#000' }}
      >
        <span>9:41</span>
        <div className="w-14 h-3 rounded-full bg-black border border-gray-700" />
        <span>100%</span>
      </div>

      {/* IG profile header */}
      <div style={{ background: '#fafafa' }}>
        {/* Name row */}
        <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: '#dbdbdb' }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 overflow-hidden"
            style={{ borderColor: '#e1306c', background: '#f0f0f0' }}
          >
            {stats?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stats.avatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-[8px] font-bold" style={{ color: '#444' }}>S&amp;Co</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate" style={{ color: '#262626' }}>
              {stats?.handle ?? 'saundersandcoagency'}
            </div>
            <div className="text-[9px] truncate" style={{ color: '#8e8e8e' }}>
              {stats?.displayName ?? 'Saunders & Co'}
            </div>
          </div>
          <div
            className="text-[10px] font-semibold px-2 py-0.5 rounded border"
            style={{ borderColor: '#dbdbdb', color: '#262626' }}
          >
            Follow
          </div>
        </div>

        {/* Stats row */}
        <div className="flex justify-around py-2 border-b" style={{ borderColor: '#dbdbdb' }}>
          {[
            [stats?.posts ?? '—', 'posts'],
            [stats?.followers ?? '—', 'followers'],
            [stats?.following ?? '—', 'following'],
          ].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="text-[11px] font-bold" style={{ color: '#262626' }}>{n}</div>
              <div className="text-[9px]" style={{ color: '#8e8e8e' }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Grid tab bar */}
        <div className="flex justify-around border-b py-1.5" style={{ borderColor: '#dbdbdb' }}>
          <div className="px-4 border-b-2" style={{ borderColor: '#262626', paddingBottom: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <div className="px-4 py-0.5" style={{ color: '#8e8e8e' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/>
              <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
            </svg>
          </div>
          <div className="px-4 py-0.5" style={{ color: '#8e8e8e' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2"/>
              <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Grid — fills full inner width, no padding, 1px gaps like IG */}
      <div
        style={{
          background: '#fafafa',
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gap: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

type SlotCellProps = {
  slot: GridSlot;
  index: number;
  isSelected: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onDrop: (fromIndex: number) => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onFileChange: (files: FileList) => void;
};

function SlotCell({
  slot, index, isSelected, isDragOver,
  onSelect, onDrop, onDragStart, onDragOver, onDragLeave, onFileChange,
}: SlotCellProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isEmpty = !slot.imageUrl;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const fromIndex = e.dataTransfer.getData('slot-index');
    if (fromIndex !== '') {
      onDrop(Number(fromIndex));
    } else if (e.dataTransfer.files?.length) {
      onFileChange(e.dataTransfer.files);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      onFileChange(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <div
      /* 4:5 portrait — IG's standard feed-post grid aspect */
      style={{ position: 'relative', aspectRatio: '4/5' }}
      draggable={!isEmpty}
      onDragStart={(e) => { e.dataTransfer.setData('slot-index', String(index)); onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      title={slot.imageName ?? `Slot ${index + 1}`}
    >
      {slot.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.imageUrl}
          alt={slot.caption || `Grid slot ${index + 1}`}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            filter: isDragOver ? 'brightness(0.7)' : undefined,
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: isDragOver ? '#c8c8c8' : '#e0e0e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => fileRef.current?.click()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      )}

      {/* Selection border */}
      {isSelected && (
        <div style={{ position: 'absolute', inset: 0, border: `2px solid ${PALETTE.accent}`, pointerEvents: 'none', zIndex: 2 }} />
      )}

      {/* Content-type indicator — matches IG's actual grid badges */}
      {slot.imageUrl && slot.contentType === 'reel' && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} title="Reel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="1.5">
            <polygon points="6,3 6,21 21,12" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      {slot.imageUrl && slot.contentType === 'carousel' && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} title="Carousel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <rect x="7" y="7" width="14" height="14" rx="2"/>
            <path d="M3 17V5a2 2 0 0 1 2-2h12"/>
          </svg>
        </div>
      )}

      {/* Live dot */}
      {slot.imageUrl && slot.status === 'live' && (
        <div style={{ position: 'absolute', top: 6, left: 6, background: '#3d7a5a', borderRadius: 9999, width: 8, height: 8, border: '1.5px solid white', zIndex: 3 }} title="Live" />
      )}

      {/* Scheduled date pill */}
      {slot.imageUrl && slot.scheduledAt && (
        <div
          style={{
            position: 'absolute', bottom: 4, left: 4, right: 4, zIndex: 3,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 8, fontWeight: 600, textAlign: 'center',
            padding: '1px 4px', borderRadius: 3,
            backdropFilter: 'blur(2px)',
          }}
          title={`Scheduled ${slot.scheduledAt}`}
        >
          {formatPillDate(slot.scheduledAt)}
        </div>
      )}

      {/* Drag-over overlay */}
      {isDragOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(108,138,255,0.25)', pointerEvents: 'none', zIndex: 2 }} />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileInput}
        tabIndex={-1}
      />
    </div>
  );
}

/** "Stats as of …" header — local HH:MM, or em-dash when unfetched. */
function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/** Format an ISO date as a short "Mon 16" pill label. */
function formatPillDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function GridPlanner() {
  const totalSlots = DEFAULT_ROWS * GRID_COLS;
  const [slots, setSlots] = useState<GridSlot[]>(() => {
    const base = initSlots(totalSlots);
    const persisted = loadPersistedSlots();
    return persisted ? hydrateSlots(base, persisted) : base;
  });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [igStats, setIgStats] = useState<IGStats | null>(null);
  const [igRefreshing, setIgRefreshing] = useState(false);

  const loadIgStats = useCallback(async (force = false) => {
    setIgRefreshing(true);
    try {
      const res = await fetch(force ? '/api/instagram/profile?refresh=1' : '/api/instagram/profile');
      const data = await res.json();
      if (!data?.fallback && data?.followers) setIgStats(data as IGStats);
    } catch {
      /* silently fall back to placeholders */
    } finally {
      setIgRefreshing(false);
    }
  }, []);

  // Persist non-blob fields on every slot change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(persistedFromSlots(slots)));
    } catch { /* storage unavailable */ }
  }, [slots]);

  // Hydrate image ObjectURLs from IndexedDB on mount.
  // The ObjectURLs are revoked on unmount to avoid memory leaks across
  // hot-reloads or page navigations.
  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    (async () => {
      const persisted = loadPersistedSlots();
      if (!persisted || persisted.length === 0) return;
      const updates: Array<{ id: string; url: string }> = [];
      for (const p of persisted) {
        if (!p.imageKey) continue;
        const url = await getImageUrl(p.imageKey);
        if (url) {
          createdUrls.push(url);
          updates.push({ id: p.id, url });
        }
      }
      if (cancelled || updates.length === 0) return;
      setSlots((prev) => prev.map((s) => {
        const u = updates.find((x) => x.id === s.id);
        return u ? { ...s, imageUrl: u.url } : s;
      }));
    })();

    return () => {
      cancelled = true;
      // Revoke any URLs we created — the IDB blob stays, only the runtime URL is gone
      for (const u of createdUrls) URL.revokeObjectURL(u);
    };
  }, []);

  // Fetch live Instagram stats on mount. Inline (not via loadIgStats) so we
  // don't call setState synchronously inside the effect body — react-hooks
  // lint rule forbids that. The manual Refresh button path still uses
  // loadIgStats with the in-flight indicator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/instagram/profile');
        const data = await res.json();
        if (!cancelled && !data?.fallback && data?.followers) {
          setIgStats(data as IGStats);
        }
      } catch {
        /* silently fall back to placeholders */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSlot = selectedIndex !== null ? slots[selectedIndex] : null;

  /**
   * Upload one or more files. With a single file, it goes to the targeted slot.
   * With multiple, the targeted slot gets file[0] and overflow fills the next
   * empty slots in order — common case is "drop a folder of mockups". When
   * all empty slots are used, extras are silently ignored.
   */
  async function handleFileChange(targetIndex: number, files: FileList) {
    if (!files.length) return;
    const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    // Build a list of slot indices to fill: target first, then the next empty
    // slots in order. Always at least the target slot.
    const indicesToFill: number[] = [targetIndex];
    for (let i = 0; i < slots.length && indicesToFill.length < fileArr.length; i++) {
      if (i === targetIndex) continue;
      if (!slots[i].imageUrl) indicesToFill.push(i);
    }

    // Persist each blob to IDB under a stable key derived from the slot ID,
    // then update React state with the new ObjectURL.
    setSlots((prev) => {
      const next = [...prev];
      for (let j = 0; j < indicesToFill.length && j < fileArr.length; j++) {
        const idx = indicesToFill[j]!;
        const file = fileArr[j]!;
        const slot = next[idx]!;
        // Revoke old URL if any (the IDB blob will be replaced below)
        if (slot.imageUrl) URL.revokeObjectURL(slot.imageUrl);
        const key = `${slot.id}-img`;
        const url = URL.createObjectURL(file);
        next[idx] = { ...slot, imageKey: key, imageUrl: url, imageName: file.name };
        // Fire-and-forget write — UI doesn't wait on IDB
        putImage(key, file).catch((err) => console.error('[grid-planner] IDB put failed', err));
      }
      return next;
    });

    setSelectedIndex(targetIndex);
  }

  function handleDrop(toIndex: number, fromIndex: number) {
    if (fromIndex === toIndex) return;
    setSlots((prev) => {
      const next = [...prev];
      const a = next[fromIndex]!;
      const b = next[toIndex]!;
      // Swap the image-related fields. Caption/label/scheduledAt/contentType
      // stay on their original slot positions — those describe the SLOT,
      // not the image.
      next[fromIndex] = { ...a, imageKey: b.imageKey, imageUrl: b.imageUrl, imageName: b.imageName };
      next[toIndex] = { ...b, imageKey: a.imageKey, imageUrl: a.imageUrl, imageName: a.imageName };
      return next;
    });
    setDragOverIndex(null);
    setDragFromIndex(null);
    setSelectedIndex(toIndex);
  }

  function updateSlot(index: number, patch: Partial<GridSlot>) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function clearSlot(index: number) {
    const slot = slots[index];
    if (slot.imageUrl) URL.revokeObjectURL(slot.imageUrl);
    if (slot.imageKey) deleteImage(slot.imageKey).catch(() => {});
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, imageKey: null, imageUrl: null, imageName: null } : s));
  }

  function addRow() {
    const currentCount = slots.length;
    setSlots((prev) => [...prev, ...Array.from({ length: GRID_COLS }, (_, i) => makeSlot(currentCount + i))]);
  }

  async function clearSavedData() {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    await clearAllImages();
    for (const s of slots) {
      if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
    }
    setSlots(initSlots(totalSlots));
    setSelectedIndex(null);
  }

  const filledCount = slots.filter((s) => s.imageUrl).length;
  const plannedCount = slots.filter((s) => s.imageUrl && s.status === 'planned').length;
  const liveCount = filledCount - plannedCount;
  const scheduledCount = slots.filter((s) => s.imageUrl && s.scheduledAt).length;

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>Instagram grid planner</h2>
            <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
              Click a slot to upload or edit · drag to rearrange · drop multiple files to bulk-fill
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] flex-wrap" style={{ color: PALETTE.muted }}>
            <span>{filledCount} image{filledCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span style={{ color: PALETTE.accent }}>{plannedCount} planned</span>
            <span>·</span>
            <span style={{ color: PALETTE.success }}>{liveCount} live</span>
            {scheduledCount > 0 && <><span>·</span><span>{scheduledCount} scheduled</span></>}
            <span style={{ opacity: 0.5 }}>|</span>
            <span title={igStats?.fetchedAt ?? ''}>
              Stats as of {formatFetchedAt(igStats?.fetchedAt)}
            </span>
            <button
              type="button"
              onClick={() => loadIgStats(true)}
              disabled={igRefreshing}
              className="underline disabled:opacity-50"
              style={{ color: PALETTE.accent, background: 'none', border: 'none', cursor: igRefreshing ? 'wait' : 'pointer', fontSize: 'inherit', padding: 0 }}
            >
              {igRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 items-start lg:justify-center">

          {/* ── Phone mockup ───────────────────────────────────────── */}
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <PhoneMockup stats={igStats}>
              {slots.map((slot, index) => (
                <SlotCell
                  key={slot.id}
                  slot={slot}
                  index={index}
                  isSelected={selectedIndex === index}
                  isDragOver={dragOverIndex === index && dragFromIndex !== index}
                  onSelect={() => setSelectedIndex(index === selectedIndex ? null : index)}
                  onDrop={(fromIndex) => handleDrop(index, fromIndex)}
                  onDragStart={() => setDragFromIndex(index)}
                  onDragOver={() => setDragOverIndex(index)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onFileChange={(files) => handleFileChange(index, files)}
                />
              ))}
            </PhoneMockup>

            <button
              onClick={addRow}
              className="mt-3 w-full rounded py-1.5 text-xs font-medium"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
            >
              + Add row (3 slots)
            </button>
          </div>

          {/* ── Editor panel ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0 w-full lg:max-w-xl space-y-4">

            {selectedSlot ? (
              <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: PALETTE.accent + '44', background: PALETTE.surface }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: PALETTE.text }}>
                    Slot {selectedIndex! + 1}
                    {selectedSlot.imageName && (
                      <span className="ml-2 font-normal" style={{ color: PALETTE.muted }}>
                        {selectedSlot.imageName}
                      </span>
                    )}
                  </span>
                  <button onClick={() => setSelectedIndex(null)} className="text-[11px]" style={{ color: PALETTE.muted }}>
                    Close
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  {/* Image preview (left) */}
                  <div>
                    {selectedSlot.imageUrl ? (
                      <div className="relative rounded overflow-hidden" style={{ aspectRatio: '4/5', background: '#111' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedSlot.imageUrl}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <button
                          onClick={() => clearSlot(selectedIndex!)}
                          className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                        >
                          Remove
                        </button>
                        <label className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                          Replace
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.length && handleFileChange(selectedIndex!, e.target.files)} />
                        </label>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer py-8" style={{ borderColor: PALETTE.accent + '44', background: `${PALETTE.accent}08`, aspectRatio: '4/5' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={PALETTE.accent} strokeWidth="2" className="mb-2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="text-xs font-medium" style={{ color: PALETTE.accent }}>Upload</span>
                        <span className="text-[10px] mt-0.5 text-center px-2" style={{ color: PALETTE.muted }}>or drop multiple<br/>to fill empty slots</span>
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files?.length && handleFileChange(selectedIndex!, e.target.files)} />
                      </label>
                    )}
                  </div>

                  {/* Editor fields (right) */}
                  <div className="space-y-3">
                    {/* Status */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: PALETTE.muted }}>Status</label>
                      <div className="flex gap-2">
                        {(['planned', 'live'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateSlot(selectedIndex!, { status: s })}
                            className="flex-1 rounded py-1 text-xs font-medium"
                            style={{
                              background: selectedSlot.status === s ? (s === 'live' ? PALETTE.success : PALETTE.accent) : PALETTE.border,
                              color: selectedSlot.status === s ? PALETTE.bg : PALETTE.muted,
                            }}
                          >
                            {s === 'live' ? 'Live' : 'Planned'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Content type */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: PALETTE.muted }}>Type</label>
                      <div className="flex gap-2">
                        {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateSlot(selectedIndex!, { contentType: t })}
                            className="flex-1 rounded py-1 text-xs font-medium"
                            style={{
                              background: selectedSlot.contentType === t ? PALETTE.accent : PALETTE.border,
                              color: selectedSlot.contentType === t ? PALETTE.bg : PALETTE.muted,
                            }}
                          >
                            {CONTENT_TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scheduled date */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Scheduled date</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={selectedSlot.scheduledAt ?? ''}
                          onChange={(e) => updateSlot(selectedIndex!, { scheduledAt: e.target.value || null })}
                          className="flex-1 rounded border px-2.5 py-1.5 text-xs"
                          style={{ borderColor: PALETTE.border, background: PALETTE.bg, color: PALETTE.text }}
                        />
                        {selectedSlot.scheduledAt && (
                          <button
                            type="button"
                            onClick={() => updateSlot(selectedIndex!, { scheduledAt: null })}
                            className="text-[10px] underline"
                            style={{ color: PALETTE.muted }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Label */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Label</label>
                      <input
                        type="text"
                        value={selectedSlot.label}
                        onChange={(e) => updateSlot(selectedIndex!, { label: e.target.value })}
                        placeholder="e.g. Campaign hero, OOTD, Product"
                        className="w-full rounded border px-2.5 py-1.5 text-xs"
                        style={{ borderColor: PALETTE.border, background: PALETTE.bg, color: PALETTE.text }}
                      />
                    </div>
                  </div>
                </div>

                {/* Caption — full width below the 2-col layout */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Caption / notes</label>
                  <textarea
                    value={selectedSlot.caption}
                    onChange={(e) => updateSlot(selectedIndex!, { caption: e.target.value })}
                    placeholder="Planned caption, mood notes, hashtags…"
                    rows={3}
                    className="w-full rounded border px-2.5 py-1.5 text-xs resize-none"
                    style={{ borderColor: PALETTE.border, background: PALETTE.bg, color: PALETTE.text }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-6 text-center" style={{ borderColor: PALETTE.border }}>
                <p className="text-xs" style={{ color: PALETTE.muted }}>
                  Select a grid slot to upload an image or edit its details.
                  <br/><span className="opacity-70">Tip: drop multiple files onto any slot to fill empty slots in order.</span>
                </p>
              </div>
            )}

            {/* Slot list */}
            {slots.some((s) => s.imageUrl) && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border }}>
                <div className="px-3 py-2 border-b" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Filled slots</span>
                </div>
                <div className="divide-y" style={{ borderColor: PALETTE.border }}>
                  {slots.map((slot, i) => slot.imageUrl && (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedIndex(i)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:opacity-80 transition"
                      style={{ background: selectedIndex === i ? `${PALETTE.accent}11` : 'transparent' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slot.imageUrl}
                        alt=""
                        style={{ width: 24, height: 30, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: PALETTE.text }}>{slot.label || `Slot ${i + 1}`}</div>
                        <div className="flex items-center gap-1.5 text-[10px] truncate" style={{ color: PALETTE.muted }}>
                          <span style={{ color: PALETTE.accent }}>{CONTENT_TYPE_LABELS[slot.contentType]}</span>
                          {slot.scheduledAt && <><span>·</span><span>{formatPillDate(slot.scheduledAt)}</span></>}
                          {slot.caption && <><span>·</span><span className="truncate">{slot.caption}</span></>}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-[10px] rounded-full px-1.5 py-0.5" style={{ background: slot.status === 'live' ? `${PALETTE.success}22` : `${PALETTE.accent}18`, color: slot.status === 'live' ? PALETTE.success : PALETTE.accent }}>
                        {slot.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[10px] px-1 flex items-center gap-2" style={{ color: PALETTE.muted }}>
              <span>
                Captions, labels, status, dates AND images persist between sessions.
              </span>
              <button
                type="button"
                onClick={clearSavedData}
                className="underline"
                style={{ color: PALETTE.danger, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}
              >
                Clear everything
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
