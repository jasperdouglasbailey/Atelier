'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { updateBookingFieldAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

type Variant = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select';

type Option = { value: string; label: string };

type Props = {
  bookingId: string;
  field: string;
  label: string;
  value: string | number | null;
  variant?: Variant;
  options?: Option[];
  placeholder?: string;
  format?: (v: string | number | null) => string | null;
  cols?: 1 | 2;
};

/**
 * Click-to-edit field on the booking detail page. Displays the value with a
 * subtle hover state (pencil icon, soft background); clicking the value
 * reveals an input that saves on Enter or blur. Esc cancels.
 *
 * The save goes through `updateBookingFieldAction` which whitelists the
 * field on the server side — so anyone can't drive arbitrary writes by
 * naming a different `field` prop.
 */
export default function InlineField({
  bookingId,
  field,
  label,
  value,
  variant = 'text',
  options,
  placeholder,
  format,
  cols = 1,
}: Props) {
  const [editing, setEditing] = useState(false);
  // savedValue tracks the last confirmed value so display updates immediately
  // without a router.refresh() round-trip.
  const [savedValue, setSavedValue] = useState<string | number | null>(value);
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Sync when the parent re-renders with a server-fresh value.
  useEffect(() => {
    setSavedValue(value);
    setDraft(value == null ? '' : String(value));
  }, [value]);

  // Autofocus when we enter edit mode.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (inputRef.current && 'select' in inputRef.current && variant !== 'select') {
        (inputRef.current as HTMLInputElement | HTMLTextAreaElement).select?.();
      }
    }
  }, [editing, variant]);

  function commit() {
    const original = savedValue == null ? '' : String(savedValue);
    if (draft === original) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBookingFieldAction(
        bookingId,
        field,
        draft === '' ? null : draft,
      );
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      // Optimistic: update displayed value immediately — no router.refresh() needed.
      setSavedValue(draft === '' ? null : draft);
      setEditing(false);
    });
  }

  function cancel() {
    setDraft(savedValue == null ? '' : String(savedValue));
    setError(null);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && variant !== 'textarea') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Enter' && variant === 'textarea' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  // ── DISPLAY MODE ──────────────────────────────────────────────────────
  if (!editing) {
    const display = format
      ? format(savedValue)
      : savedValue == null || savedValue === ''
        ? null
        : String(savedValue);

    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group relative w-full text-left rounded-md transition ${cols === 2 ? 'col-span-2' : ''}`}
        style={{
          padding: '8px 28px 8px 10px',
          border: '1px solid transparent',
          background: 'transparent',
          cursor: 'text',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(108,138,255,0.05)';
          e.currentTarget.style.borderColor = PALETTE.border;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: PALETTE.muted }}
        >
          {label}
        </div>
        <div className="mt-0.5 text-sm" style={{ color: display ? PALETTE.text : PALETTE.muted, whiteSpace: variant === 'textarea' ? 'pre-wrap' : undefined }}>
          {display ?? (placeholder ? <span style={{ fontStyle: 'italic', opacity: 0.6 }}>{placeholder}</span> : '—')}
        </div>
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 transition text-[11px]"
          style={{ color: PALETTE.muted }}
        >
          ✎
        </span>
      </button>
    );
  }

  // ── EDIT MODE ─────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: PALETTE.bg,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.accent}`,
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    width: '100%',
    outline: 'none',
  };

  return (
    <div
      className={`relative rounded-md ${cols === 2 ? 'col-span-2' : ''}`}
      style={{
        padding: '8px 10px',
        background: 'rgba(108,138,255,0.06)',
        border: `1px solid ${PALETTE.accent}`,
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: PALETTE.muted }}
      >
        {label}
      </div>

      {variant === 'textarea' ? (
        <textarea
          ref={(el) => { inputRef.current = el; }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          disabled={pending}
        />
      ) : variant === 'select' ? (
        <select
          ref={(el) => { inputRef.current = el; }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          style={inputStyle}
          disabled={pending}
        >
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          ref={(el) => { inputRef.current = el; }}
          type={variant === 'date' ? 'date' : variant === 'time' ? 'time' : variant === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          placeholder={placeholder}
          style={inputStyle}
          disabled={pending}
        />
      )}

      {(error || pending) && (
        <div className="mt-1 text-[10px]" style={{ color: error ? PALETTE.danger : PALETTE.muted }}>
          {error ?? 'Saving…'}
        </div>
      )}
    </div>
  );
}
