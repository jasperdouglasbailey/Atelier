'use client';

/**
 * Instagram Grid Planner
 *
 * Phone mockup of @saundersandcoagency's Instagram grid.
 * 3 columns × N rows at 9:16 (portrait) per slot — matching Reels/portrait post format.
 * Stats are fetched live from /api/instagram/profile on mount.
 */

import { useRef, useState, useEffect, DragEvent, ChangeEvent } from 'react';
import { PALETTE } from '@/lib/utils/constants';

const GRID_COLS = 3;
const DEFAULT_ROWS = 4;   // 12 slots to start
const PHONE_OUTER_W = 330; // px — outer phone frame width

type GridSlot = {
  id: string;
  imageUrl: string | null;
  imageFile: File | null;
  caption: string;
  status: 'planned' | 'live';
  label: string;
};

type IGStats = {
  posts: string;
  followers: string;
  following: string;
};

function makeSlot(index: number): GridSlot {
  return {
    id: `slot-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    imageUrl: null,
    imageFile: null,
    caption: '',
    status: 'planned',
    label: '',
  };
}

function initSlots(count: number): GridSlot[] {
  return Array.from({ length: count }, (_, i) => makeSlot(i));
}

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
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2"
            style={{ borderColor: '#e1306c', background: '#f0f0f0' }}
          >
            <span className="text-[8px] font-bold" style={{ color: '#444' }}>S&amp;Co</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: '#262626' }}>saundersandco</div>
            <div className="text-[9px]" style={{ color: '#8e8e8e' }}>Saunders &amp; Co Agency</div>
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
      /* 9:16 portrait aspect ratio */
      style={{ position: 'relative', aspectRatio: '9/16' }}
      draggable={!isEmpty}
      onDragStart={(e) => { e.dataTransfer.setData('slot-index', String(index)); onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      title={slot.imageFile?.name ?? `Slot ${index + 1}`}
    >
      {slot.imageUrl ? (
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
        <div style={{ position: 'absolute', inset: 0, border: '2px solid #6c8aff', pointerEvents: 'none', zIndex: 2 }} />
      )}

      {/* Live dot */}
      {slot.imageUrl && slot.status === 'live' && (
        <div style={{ position: 'absolute', top: 4, right: 4, background: '#4ade80', borderRadius: 9999, width: 7, height: 7, zIndex: 3 }} />
      )}

      {/* Drag-over overlay */}
      {isDragOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(108,138,255,0.25)', pointerEvents: 'none', zIndex: 2 }} />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileInput}
        tabIndex={-1}
      />
    </div>
  );
}

export default function GridPlanner() {
  const totalSlots = DEFAULT_ROWS * GRID_COLS;
  const [slots, setSlots] = useState<GridSlot[]>(() => initSlots(totalSlots));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [igStats, setIgStats] = useState<IGStats | null>(null);

  // Fetch live Instagram stats on mount
  useEffect(() => {
    fetch('/api/instagram/profile')
      .then((r) => r.json())
      .then((data) => {
        if (!data.fallback) {
          setIgStats({ posts: data.posts, followers: data.followers, following: data.following });
        }
      })
      .catch(() => {/* silently fall back to — placeholders */});
  }, []);

  const selectedSlot = selectedIndex !== null ? slots[selectedIndex] : null;

  function handleFileChange(index: number, files: FileList) {
    const file = files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, imageUrl: url, imageFile: file } : s));
    setSelectedIndex(index);
  }

  function handleDrop(toIndex: number, fromIndex: number) {
    if (fromIndex === toIndex) return;
    setSlots((prev) => {
      const next = [...prev];
      const { imageUrl: fromUrl, imageFile: fromFile } = next[fromIndex];
      const { imageUrl: toUrl, imageFile: toFile } = next[toIndex];
      next[fromIndex] = { ...next[fromIndex], imageUrl: toUrl, imageFile: toFile };
      next[toIndex] = { ...next[toIndex], imageUrl: fromUrl, imageFile: fromFile };
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
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, imageUrl: null, imageFile: null } : s));
  }

  function addRow() {
    const currentCount = slots.length;
    setSlots((prev) => [...prev, ...Array.from({ length: GRID_COLS }, (_, i) => makeSlot(currentCount + i))]);
  }

  const filledCount = slots.filter((s) => s.imageUrl).length;
  const plannedCount = slots.filter((s) => s.imageUrl && s.status === 'planned').length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">

        {/* ── Phone mockup ───────────────────────────────────────── */}
        <div className="flex-shrink-0">
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

          <div className="mt-2 flex justify-center gap-4 text-[11px]" style={{ color: PALETTE.muted }}>
            <span>{filledCount} image{filledCount !== 1 ? 's' : ''}</span>
            <span style={{ color: PALETTE.success }}>{plannedCount} planned</span>
            <span>{filledCount - plannedCount} live</span>
          </div>
        </div>

        {/* ── Editor panel ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0 max-w-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: PALETTE.text }}>Instagram Grid Planner</h2>
            <p className="text-xs" style={{ color: PALETTE.muted }}>
              Click a slot to add an image or edit details. Drag to rearrange. 9:16 portrait format.
              Green dot = live. No dot = planned.
            </p>
          </div>

          {selectedSlot ? (
            <div className="rounded-lg border p-4 space-y-4" style={{ borderColor: PALETTE.accent + '44', background: PALETTE.surface }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: PALETTE.text }}>
                  Slot {selectedIndex! + 1}
                  {selectedSlot.imageFile && (
                    <span className="ml-2 font-normal" style={{ color: PALETTE.muted }}>
                      {selectedSlot.imageFile.name}
                    </span>
                  )}
                </span>
                <button onClick={() => setSelectedIndex(null)} className="text-[11px]" style={{ color: PALETTE.muted }}>
                  Close
                </button>
              </div>

              {/* Image preview */}
              <div>
                {selectedSlot.imageUrl ? (
                  <div className="relative rounded overflow-hidden" style={{ aspectRatio: '9/16', background: '#111' }}>
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
                  <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer py-8" style={{ borderColor: PALETTE.accent + '44', background: `${PALETTE.accent}08` }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={PALETTE.accent} strokeWidth="2" className="mb-2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-xs font-medium" style={{ color: PALETTE.accent }}>Upload image</span>
                    <span className="text-[10px] mt-0.5" style={{ color: PALETTE.muted }}>or drag a file here</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.length && handleFileChange(selectedIndex!, e.target.files)} />
                  </label>
                )}
              </div>

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
                        color: selectedSlot.status === s ? '#0a0a0a' : PALETTE.muted,
                      }}
                    >
                      {s === 'live' ? 'Live' : 'Planned'}
                    </button>
                  ))}
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

              {/* Caption */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Caption / Notes</label>
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
              </p>
            </div>
          )}

          {/* Slot list */}
          {slots.some((s) => s.imageUrl) && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>All slots</span>
              </div>
              <div className="divide-y" style={{ borderColor: PALETTE.border }}>
                {slots.map((slot, i) => slot.imageUrl && (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedIndex(i)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:opacity-80 transition"
                    style={{ background: selectedIndex === i ? `${PALETTE.accent}11` : 'transparent' }}
                  >
                    <img
                      src={slot.imageUrl}
                      alt=""
                      style={{ width: 24, height: 43, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate" style={{ color: PALETTE.text }}>{slot.label || `Slot ${i + 1}`}</div>
                      {slot.caption && <div className="text-[10px] truncate" style={{ color: PALETTE.muted }}>{slot.caption}</div>}
                    </div>
                    <span className="flex-shrink-0 text-[10px] rounded-full px-1.5 py-0.5" style={{ background: slot.status === 'live' ? `${PALETTE.success}22` : `${PALETTE.accent}18`, color: slot.status === 'live' ? PALETTE.success : PALETTE.accent }}>
                      {slot.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] px-1" style={{ color: PALETTE.muted }}>
            Images are stored locally — this planner is session-only and does not save to the server.
          </div>
        </div>
      </div>
    </div>
  );
}
