'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateEdmAction,
  createEdmGmailDraftAction,
  markEdmSentAction,
  deleteEdmAction,
  duplicateEdmAction,
  sendEdmTestAction,
} from '@/app/actions/edms';
import DriveImagePicker from './DriveImagePicker';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import {
  renderEdmHtml,
  type EdmImage,
  type MonthlyRoundupPayload,
  type ArtistCampaignPayload,
} from '@/lib/edms/templates';
import { PALETTE } from '@/lib/utils/constants';
import type { Edm } from '@/lib/types/database';

type Props = { edm: Edm; googleConnected: boolean };

type PickerTarget =
  | { kind: 'roundup_hero' }
  | { kind: 'roundup_entry'; index: number }
  | { kind: 'campaign_hero' }
  | { kind: 'campaign_gallery_add' }
  | { kind: 'campaign_gallery_replace'; index: number };

export default function EdmEditor({ edm, googleConnected }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(edm.title);
  const [subject, setSubject] = useState(edm.subject ?? '');
  const [preheader, setPreheader] = useState(edm.preheader ?? '');
  const [payload, setPayload] = useState<MonthlyRoundupPayload | ArtistCampaignPayload>(
    (edm.payload as MonthlyRoundupPayload | ArtistCampaignPayload) ?? {},
  );

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Re-render preview off the live state — no round-trip needed.
  const previewHtml = useMemo(
    () => renderEdmHtml(edm.template, payload, preheader),
    [edm.template, payload, preheader],
  );

  function save(extra?: { onAfter?: () => void }) {
    startTransition(async () => {
      const result = await updateEdmAction({
        id: edm.id,
        title,
        subject: subject || null,
        preheader: preheader || null,
        payload,
      });
      if (result.ok) {
        setFeedback({ kind: 'ok', msg: 'Saved.' });
        extra?.onAfter?.();
        router.refresh();
      } else {
        setFeedback({ kind: 'err', msg: result.error });
      }
    });
  }

  function handlePick(img: EdmImage) {
    if (!pickerTarget) return;
    const next = { ...payload } as MonthlyRoundupPayload & ArtistCampaignPayload;
    if (pickerTarget.kind === 'roundup_hero' || pickerTarget.kind === 'campaign_hero') {
      next.hero = img;
    } else if (pickerTarget.kind === 'roundup_entry') {
      const entries = [...((next as MonthlyRoundupPayload).entries ?? [])];
      entries[pickerTarget.index] = { ...entries[pickerTarget.index], image: img };
      (next as MonthlyRoundupPayload).entries = entries;
    } else if (pickerTarget.kind === 'campaign_gallery_add') {
      const gallery = [...((next as ArtistCampaignPayload).gallery ?? [])];
      gallery.push(img);
      (next as ArtistCampaignPayload).gallery = gallery;
    } else if (pickerTarget.kind === 'campaign_gallery_replace') {
      const gallery = [...((next as ArtistCampaignPayload).gallery ?? [])];
      gallery[pickerTarget.index] = img;
      (next as ArtistCampaignPayload).gallery = gallery;
    }
    setPayload(next);
    setPickerTarget(null);
  }

  function createDraft() {
    if (!googleConnected) {
      setFeedback({ kind: 'err', msg: 'Connect Google in Settings first.' });
      return;
    }
    save({
      onAfter: () => {
        startTransition(async () => {
          const result = await createEdmGmailDraftAction(edm.id);
          if (result.ok) {
            setFeedback({ kind: 'ok', msg: 'Gmail draft created. Open Gmail to paste recipients and send.' });
            router.refresh();
          } else {
            setFeedback({ kind: 'err', msg: result.error });
          }
        });
      },
    });
  }

  function markSent() {
    if (!confirm('Mark this EDM as sent? It moves to the sent list.')) return;
    startTransition(async () => {
      const result = await markEdmSentAction(edm.id);
      if (result.ok) router.push('/edms');
      else setFeedback({ kind: 'err', msg: result.error });
    });
  }

  function remove() {
    if (!confirm('Delete this EDM? This cannot be undone.')) return;
    startTransition(async () => {
      const result = await deleteEdmAction(edm.id);
      if (result.ok) router.push('/edms');
      else setFeedback({ kind: 'err', msg: result.error });
    });
  }

  function duplicate() {
    save({
      onAfter: () => {
        startTransition(async () => {
          const result = await duplicateEdmAction(edm.id);
          if (result.ok) router.push(`/edms/${result.newId}`);
          else setFeedback({ kind: 'err', msg: result.error });
        });
      },
    });
  }

  function sendTest() {
    if (!googleConnected) {
      setFeedback({ kind: 'err', msg: 'Connect Google in Settings first.' });
      return;
    }
    save({
      onAfter: () => {
        startTransition(async () => {
          const result = await sendEdmTestAction(edm.id);
          if (result.ok) setFeedback({ kind: 'ok', msg: `Test sent to ${result.to}.` });
          else setFeedback({ kind: 'err', msg: result.error });
        });
      },
    });
  }

  // Drag-reorder helpers for round-up entries.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function reorderEntry(from: number, to: number) {
    const p = payload as MonthlyRoundupPayload;
    const entries = [...(p.entries ?? [])];
    if (from < 0 || to < 0 || from >= entries.length || to >= entries.length) return;
    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);
    setPayload({ ...p, entries });
  }

  const cfg = getAgencyConfig();

  // ─── per-template slot UI ──────────────────────────────────────────
  let slotEditor: React.ReactNode = null;
  if (edm.template === 'monthly_roundup') {
    const p = payload as MonthlyRoundupPayload;
    const entries = p.entries ?? [];
    slotEditor = (
      <div className="space-y-5">
        <FieldRow label="Edition (eg. 'October 2026')">
          <input
            type="text"
            value={p.edition ?? ''}
            onChange={(e) => setPayload({ ...p, edition: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
        <ImageSlot
          label="Hero image"
          image={p.hero}
          onPick={() => setPickerTarget({ kind: 'roundup_hero' })}
          onClear={() => setPayload({ ...p, hero: undefined })}
        />
        <FieldRow label="Headline">
          <input
            type="text"
            value={p.headline ?? ''}
            onChange={(e) => setPayload({ ...p, headline: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
        <FieldRow label="Intro paragraph">
          <textarea
            value={p.intro ?? ''}
            rows={3}
            onChange={(e) => setPayload({ ...p, intro: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>

        <div className="border-t pt-4" style={{ borderColor: PALETTE.border }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Entries ({entries.length}/6) — drag to reorder
            </span>
            <button
              type="button"
              onClick={() => {
                if (entries.length >= 6) return;
                setPayload({ ...p, entries: [...entries, {}] });
              }}
              disabled={entries.length >= 6}
              className="text-xs rounded-md border px-2 py-1"
              style={{ borderColor: PALETTE.border, color: PALETTE.text, opacity: entries.length >= 6 ? 0.5 : 1 }}
            >
              + Add entry
            </button>
          </div>
          <div className="space-y-4">
            {entries.map((e, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(ev) => { ev.preventDefault(); }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) reorderEntry(dragIndex, i);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className="rounded-md border p-3 space-y-3"
                style={{
                  borderColor: dragIndex === i ? PALETTE.accent : PALETTE.border,
                  background: PALETTE.bg,
                  opacity: dragIndex === i ? 0.55 : 1,
                  cursor: 'move',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider flex items-center gap-2" style={{ color: PALETTE.muted }}>
                    <span style={{ cursor: 'grab', fontSize: 14, lineHeight: 1 }} aria-hidden="true">⋮⋮</span>
                    Entry {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reorderEntry(i, i - 1)}
                      disabled={i === 0}
                      className="text-xs"
                      style={{ background: 'transparent', border: 'none', color: i === 0 ? PALETTE.border : PALETTE.muted, cursor: i === 0 ? 'default' : 'pointer' }}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderEntry(i, i + 1)}
                      disabled={i === entries.length - 1}
                      className="text-xs"
                      style={{ background: 'transparent', border: 'none', color: i === entries.length - 1 ? PALETTE.border : PALETTE.muted, cursor: i === entries.length - 1 ? 'default' : 'pointer' }}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = entries.filter((_, j) => j !== i);
                        setPayload({ ...p, entries: next });
                      }}
                      className="text-xs"
                      style={{ background: 'transparent', border: 'none', color: PALETTE.danger, cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <ImageSlot
                  label="Image"
                  image={e.image}
                  onPick={() => setPickerTarget({ kind: 'roundup_entry', index: i })}
                  onClear={() => {
                    const next = [...entries];
                    next[i] = { ...next[i], image: undefined };
                    setPayload({ ...p, entries: next });
                  }}
                />
                <input
                  type="text"
                  placeholder="Title"
                  value={e.title ?? ''}
                  onChange={(ev) => {
                    const next = [...entries];
                    next[i] = { ...next[i], title: ev.target.value };
                    setPayload({ ...p, entries: next });
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
                  style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                />
                <textarea
                  placeholder="Body"
                  rows={2}
                  value={e.body ?? ''}
                  onChange={(ev) => {
                    const next = [...entries];
                    next[i] = { ...next[i], body: ev.target.value };
                    setPayload({ ...p, entries: next });
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
                  style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="CTA label (eg. View work)"
                    value={e.cta_label ?? ''}
                    onChange={(ev) => {
                      const next = [...entries];
                      next[i] = { ...next[i], cta_label: ev.target.value };
                      setPayload({ ...p, entries: next });
                    }}
                    className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                  />
                  <input
                    type="text"
                    placeholder="https://…"
                    value={e.cta_href ?? ''}
                    onChange={(ev) => {
                      const next = [...entries];
                      next[i] = { ...next[i], cta_href: ev.target.value };
                      setPayload({ ...p, entries: next });
                    }}
                    className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Second add-entry button so it's always reachable without scrolling
              back to the top of the entries section. */}
          {entries.length > 0 && entries.length < 6 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setPayload({ ...p, entries: [...entries, {}] })}
                className="w-full rounded-md border border-dashed px-4 py-3 text-sm"
                style={{ borderColor: PALETTE.border, color: PALETTE.muted, background: PALETTE.bg }}
              >
                + Add another entry
              </button>
            </div>
          )}
        </div>

        <FieldRow label="Sign-off">
          <textarea
            value={p.signoff ?? ''}
            rows={2}
            onChange={(e) => setPayload({ ...p, signoff: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
      </div>
    );
  } else {
    const p = payload as ArtistCampaignPayload;
    const gallery = p.gallery ?? [];
    slotEditor = (
      <div className="space-y-5">
        <ImageSlot
          label="Hero image"
          image={p.hero}
          onPick={() => setPickerTarget({ kind: 'campaign_hero' })}
          onClear={() => setPayload({ ...p, hero: undefined })}
        />
        <FieldRow label="Eyebrow (eg. 'New campaign')">
          <input
            type="text"
            value={p.eyebrow ?? ''}
            onChange={(e) => setPayload({ ...p, eyebrow: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
        <FieldRow label="Headline">
          <input
            type="text"
            value={p.headline ?? ''}
            onChange={(e) => setPayload({ ...p, headline: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
        <FieldRow label="Sub-headline (eg. artist name)">
          <input
            type="text"
            value={p.subhead ?? ''}
            onChange={(e) => setPayload({ ...p, subhead: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
        <FieldRow label="Body">
          <textarea
            value={p.body ?? ''}
            rows={4}
            onChange={(e) => setPayload({ ...p, body: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>

        <div className="border-t pt-4" style={{ borderColor: PALETTE.border }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted }}>
              Gallery ({gallery.length}/6)
            </span>
            <button
              type="button"
              onClick={() => setPickerTarget({ kind: 'campaign_gallery_add' })}
              disabled={gallery.length >= 6}
              className="text-xs rounded-md border px-2 py-1"
              style={{ borderColor: PALETTE.border, color: PALETTE.text, opacity: gallery.length >= 6 ? 0.5 : 1 }}
            >
              + Add image
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((img, i) => (
              <div key={i} className="relative rounded-md border overflow-hidden" style={{ borderColor: PALETTE.border }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => {
                    const next = gallery.filter((_, j) => j !== i);
                    setPayload({ ...p, gallery: next });
                  }}
                  className="absolute top-1 right-1 rounded-full text-[10px] px-1.5 py-0.5"
                  style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="CTA label"
            value={p.cta_label ?? ''}
            onChange={(e) => setPayload({ ...p, cta_label: e.target.value })}
            className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
          <input
            type="text"
            placeholder="https://…"
            value={p.cta_href ?? ''}
            onChange={(e) => setPayload({ ...p, cta_href: e.target.value })}
            className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </div>
        <FieldRow label="Sign-off">
          <textarea
            value={p.signoff ?? ''}
            rows={2}
            onChange={(e) => setPayload({ ...p, signoff: e.target.value })}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text }}
          />
        </FieldRow>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
      {pickerTarget && (
        <DriveImagePicker onPick={handlePick} onClose={() => setPickerTarget(null)} />
      )}

      {/* Editor pane */}
      <div className="space-y-5 pb-24">
        {/* Inbox preview — what the recipient sees at-a-glance before they open. */}
        <InboxPreview fromName={cfg.name} fromEmail={cfg.email ?? ''} subject={subject} preheader={preheader} />

        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
          <FieldRow label="Internal title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </FieldRow>
          <FieldRow label="Email subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </FieldRow>
          <FieldRow label="Preheader (first ~90 chars shown in inbox)">
            <input
              type="text"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </FieldRow>
        </div>

        <div className="rounded-lg border p-4" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
          {slotEditor}
        </div>

        {feedback && (
          <div
            className="rounded-md border p-3 text-xs"
            style={{
              borderColor: feedback.kind === 'ok' ? PALETTE.ok : PALETTE.danger,
              color: feedback.kind === 'ok' ? PALETTE.ok : PALETTE.danger,
              background: feedback.kind === 'ok' ? PALETTE.okBg : PALETTE.dangerBg,
            }}
          >
            {feedback.msg}
          </div>
        )}
      </div>

      {/* Preview pane */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>
          Preview
        </div>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: PALETTE.border, background: '#f5f3ef' }}>
          <iframe
            srcDoc={previewHtml}
            title="EDM preview"
            style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Sticky action bar — always one tap away. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className="rounded-md px-4 py-2 text-xs font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg, opacity: pending ? 0.6 : 1 }}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={pending || edm.status === 'sent'}
            className="rounded-md border px-4 py-2 text-xs font-medium"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, opacity: pending || edm.status === 'sent' ? 0.6 : 1 }}
            title={cfg.email ? `Send a test to ${cfg.email}` : 'No agency email configured'}
          >
            Send test to me
          </button>
          <button
            type="button"
            onClick={createDraft}
            disabled={pending || edm.status === 'sent'}
            className="rounded-md border px-4 py-2 text-xs font-medium"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, opacity: pending || edm.status === 'sent' ? 0.6 : 1 }}
          >
            Save + create Gmail draft
          </button>
          {edm.gmail_draft_id && (
            <a
              href={`https://mail.google.com/mail/u/0/#drafts/${edm.gmail_draft_id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-4 py-2 text-xs"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            >
              Open in Gmail ↗
            </a>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={duplicate}
            disabled={pending}
            className="rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
          >
            Duplicate
          </button>
          {edm.status === 'draft' && (
            <button
              type="button"
              onClick={markSent}
              className="rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
            >
              Mark sent
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            className="rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: PALETTE.danger, color: PALETTE.danger }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxPreview({
  fromName, fromEmail, subject, preheader,
}: {
  fromName: string;
  fromEmail: string;
  subject: string;
  preheader: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: PALETTE.border, background: PALETTE.bg }}
    >
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>
        Inbox preview
      </div>
      <div className="text-sm" style={{ color: PALETTE.text }}>
        <span style={{ fontWeight: 600 }}>{fromName}</span>
        {fromEmail && <span style={{ color: PALETTE.muted }}> &lt;{fromEmail}&gt;</span>}
      </div>
      <div className="text-sm mt-0.5" style={{ color: PALETTE.text, fontWeight: 500 }}>
        {subject || <span style={{ color: PALETTE.muted, fontWeight: 400 }}>(no subject)</span>}
      </div>
      <div className="text-xs mt-0.5 truncate" style={{ color: PALETTE.muted }}>
        {preheader || <em>Preheader appears here in the inbox preview.</em>}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: PALETTE.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ImageSlot({
  label, image, onPick, onClear,
}: {
  label: string;
  image: EdmImage | undefined;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <FieldRow label={label}>
      {image?.url ? (
        <div className="relative rounded-md border overflow-hidden" style={{ borderColor: PALETTE.border }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
          <div className="flex gap-2 p-2 items-center" style={{ background: PALETTE.bg }}>
            <button
              type="button"
              onClick={onPick}
              className="text-xs rounded-md border px-2 py-1"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            >
              Replace
            </button>
            {image.viewLink && (
              <a
                href={image.viewLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs rounded-md border px-2 py-1"
                style={{ borderColor: PALETTE.border, color: PALETTE.muted, textDecoration: 'none' }}
              >
                Open in Drive ↗
              </a>
            )}
            <button
              type="button"
              onClick={onClear}
              className="text-xs rounded-md border px-2 py-1"
              style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="w-full rounded-md border border-dashed px-4 py-6 text-sm text-center"
          style={{ borderColor: PALETTE.border, color: PALETTE.muted, background: PALETTE.bg }}
        >
          + Pick from Drive
        </button>
      )}
    </FieldRow>
  );
}
