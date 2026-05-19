'use client';

/**
 * "Important" pinned-note banner with edit-in-place.
 *
 * Lives above the tabs on the client detail page. The note exists for
 * things like "Always CC accounts@…" — the kind of reminder that gets
 * updated more than once a quarter. Round-tripping through /edit each
 * time would be friction, so this panel supports inline editing:
 *
 *   - Display mode: warning-toned banner + small "Edit" affordance.
 *     Renders nothing when no note exists, but shows an "+ Add note"
 *     button alongside the panel ONLY when `editable` is on.
 *   - Edit mode: inline textarea + Save/Cancel. Cmd/Ctrl-Enter saves.
 *
 * Reusable: shape is generic so the same component can ship on talent
 * and crew detail pages once they grow an `important_note` column.
 */

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientImportantNoteAction } from '@/app/actions/entities';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** The current note. `null` / `''` renders the empty-state CTA when `editable`. */
  note: string | null | undefined;
  /** The id of the record to update. Only required when `editable` is true. */
  clientId?: string;
  /** When `true`, exposes the inline edit affordance. */
  editable?: boolean;
};

export default function ImportantPanel({ note, clientId, editable = false }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  function startEdit() {
    setDraft(note ?? '');
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraft(note ?? '');
    setIsEditing(false);
    setError(null);
  }

  function save() {
    if (!clientId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateClientImportantNoteAction(clientId, draft);
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl-Enter to save, Esc to cancel — standard inline-edit shortcuts.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  const hasNote = !!note && note.trim().length > 0;

  // Display mode, no note, not editable → render nothing (preserves the
  // original drop-in-anywhere contract).
  if (!hasNote && !editable) return null;

  // Empty state with edit affordance — small inline "+ Add" link.
  if (!hasNote && editable && !isEditing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="rounded-lg border-l-4 p-3 w-full text-left"
        style={{
          background: 'transparent',
          borderLeftColor: PALETTE.border,
          borderTop: `1px dashed ${PALETTE.border}`,
          borderRight: `1px dashed ${PALETTE.border}`,
          borderBottom: `1px dashed ${PALETTE.border}`,
          color: PALETTE.muted,
          cursor: 'pointer',
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1">+ Add important note</div>
        <p className="text-[11px]">Short pinned reminder shown on every tab (e.g. &ldquo;CC accounts@…&rdquo;).</p>
      </button>
    );
  }

  return (
    <section
      className="rounded-lg border-l-4 p-3"
      style={{
        background: `${PALETTE.warning}10`,
        borderLeftColor: PALETTE.warning,
        borderTop: `1px solid ${PALETTE.border}`,
        borderRight: `1px solid ${PALETTE.border}`,
        borderBottom: `1px solid ${PALETTE.border}`,
      }}
      role="note"
      aria-label="Important note"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: PALETTE.warning }}
        >
          Important
        </div>
        {editable && !isEditing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: PALETTE.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
            aria-label="Edit important note"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="mt-1 space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            style={{
              width: '100%',
              background: PALETTE.bg,
              color: PALETTE.text,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: 13,
              resize: 'vertical',
              outline: 'none',
            }}
            placeholder="Short pinned reminder…"
            aria-label="Important note text"
          />
          {error && (
            <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isPending}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <span className="text-[10px]" style={{ color: PALETTE.muted }}>⌘↵ to save · Esc to cancel</span>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap mt-1" style={{ color: PALETTE.text }}>{note}</p>
      )}
    </section>
  );
}
