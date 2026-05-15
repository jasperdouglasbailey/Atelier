'use client';

import { useState, useRef, useMemo } from 'react';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** Currently selected tags. */
  value: string[];
  /** Called with the new array on every add/remove. */
  onChange: (next: string[]) => void;
  /** Tags that exist on OTHER locations — shown as suggestions when the
   *  input gets focus or as autocomplete matches when typing. */
  suggestions: string[];
  /** Optional placeholder when no tag is being typed. */
  placeholder?: string;
};

/**
 * Pill-style tag input with autocomplete against existing tags from across
 * the location library. Adds-on-enter, adds-on-comma, removes-on-backspace
 * (when input is empty). Case-insensitive dedupe — typing "rooftop" when
 * "Rooftop" already exists adds nothing.
 *
 * Used in LocationForm; matches the pattern used by the rest of the
 * dashboard's pill-style controls (facility chips, tier pills).
 */
export default function TagInput({ value, onChange, suggestions, placeholder = 'Add a tag…' }: Props) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Case-insensitive set of current tags for dedupe checks
  const currentLower = useMemo(
    () => new Set(value.map((t) => t.trim().toLowerCase())),
    [value],
  );

  // Suggestions that match the current draft (or all unused suggestions when
  // the input is empty + focused — gives a quick "what tags exist?" view).
  const filteredSuggestions = useMemo(() => {
    const draftLower = draft.trim().toLowerCase();
    const unused = suggestions.filter((s) => !currentLower.has(s.toLowerCase()));
    if (!draftLower) return unused.slice(0, 8);
    return unused
      .filter((s) => s.toLowerCase().includes(draftLower))
      .slice(0, 8);
  }, [draft, suggestions, currentLower]);

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (currentLower.has(t.toLowerCase())) return;
    onChange([...value, t]);
    setDraft('');
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeTag(value.length - 1);
    } else if (e.key === 'Escape') {
      setDraft('');
      inputRef.current?.blur();
    }
  }

  return (
    <div>
      {/* Pill row + inline input */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-2"
        style={{ borderColor: focused ? PALETTE.accent : PALETTE.border, background: PALETTE.bg }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={tag + i}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${PALETTE.accent}24`, color: PALETTE.accent }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="opacity-60 hover:opacity-100"
              aria-label={`Remove ${tag}`}
              style={{ marginLeft: 2, lineHeight: 1, fontSize: 12 }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Add on blur if draft has content — wraps in setTimeout so a
            // click on a suggestion pill registers first
            setTimeout(() => {
              if (draft.trim()) addTag(draft);
              setFocused(false);
            }, 100);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          style={{ color: PALETTE.text }}
        />
      </div>

      {/* Suggestion row — appears when focused + there are matches */}
      {focused && filteredSuggestions.length > 0 && (
        <div
          className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md p-2"
          style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}` }}
        >
          <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.muted, marginRight: 4 }}>
            Suggestions
          </span>
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium transition"
              style={{ background: `${PALETTE.accent}10`, color: PALETTE.text, border: `1px solid ${PALETTE.border}` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${PALETTE.accent}24`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `${PALETTE.accent}10`; }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="mt-1 text-[10px]" style={{ color: PALETTE.muted, opacity: 0.7 }}>
        Press <kbd style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, padding: '0 4px', borderRadius: 2, fontSize: 9 }}>Enter</kbd> or <kbd style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, padding: '0 4px', borderRadius: 2, fontSize: 9 }}>,</kbd> to add · click × to remove · backspace removes last tag
      </div>
    </div>
  );
}
