'use client';

/**
 * Preferred crew panel — surfaces an artist's go-to crew on their talent
 * detail page. Each artist curates their own list; the entries are then
 * used by BookingTeam (surfaces them first in the add-crew dropdown when
 * this artist is the booking's primary) and by the forthcoming "Who's
 * free?" availability blast (only targets this artist's preferred crew,
 * not the entire preferred-core pool).
 *
 * UX:
 *   - Inline form at the top — pick a crew member, optional role hint
 *     ("on Oliver's shoots Mason runs digital"), optional note.
 *   - Each row shows name, role (hint || crew's primary_role), city,
 *     contact. One-click remove.
 *   - Owner/partner only — but this whole route is gated already.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { addPreferredCrewAction, removePreferredCrewAction } from '@/app/actions/preferred-crew';
import type { Crew } from '@/lib/types/database';

type PreferredRow = {
  id: string;
  crew_id: string;
  role_hint: string | null;
  notes: string | null;
  crew?: Crew;
};

type Props = {
  talentId: string;
  talentName: string;
  preferred: PreferredRow[];
  allCrew: Crew[];
};

export default function PreferredCrewPanel({ talentId, talentName, preferred, allCrew }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const usedCrewIds = new Set(preferred.map((p) => p.crew_id));
  const availableCrew = allCrew
    .filter((c) => !usedCrewIds.has(c.id) && c.is_active)
    .sort((a, b) => a.name.localeCompare(b.name));

  function handleAdd(formData: FormData) {
    setError(null);
    const crewId = formData.get('crew_id') as string;
    const roleHint = (formData.get('role_hint') as string) || undefined;
    const notes = (formData.get('notes') as string) || undefined;
    if (!crewId) {
      setError('Pick a crew member');
      return;
    }
    startTransition(async () => {
      const result = await addPreferredCrewAction({ talentId, crewId, roleHint, notes });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowAdd(false);
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    if (!confirm('Remove from preferred crew?')) return;
    startTransition(async () => {
      const result = await removePreferredCrewAction({ id, talentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Preferred Crew ({preferred.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="text-[11px] font-medium"
          style={{ color: PALETTE.accent, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {showAdd ? 'Cancel' : '+ Add crew'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          action={handleAdd}
          className="mb-3 space-y-2 rounded border p-3"
          style={{ borderColor: PALETTE.border, background: PALETTE.bg }}
        >
          <select
            name="crew_id"
            required
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="">Select crew member...</option>
            {availableCrew.map((c) => {
              const role = c.primary_role
                ? [c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')
                : 'General';
              return (
                <option key={c.id} value={c.id}>
                  {c.name} — {role}{c.city ? ` · ${c.city}` : ''}
                </option>
              );
            })}
          </select>
          <input
            name="role_hint"
            placeholder={`Role on ${talentName}'s shoots (optional)`}
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.text }}
          />
          <input
            name="notes"
            placeholder="Notes (optional) — e.g. 'always AM only'"
            className="w-full rounded border px-2 py-1 text-xs"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.text }}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            {pending ? 'Adding…' : 'Add to preferred'}
          </button>
        </form>
      )}

      {/* List */}
      {preferred.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          No preferred crew yet. Add the people {talentName} likes to work with — they&apos;ll appear at the top of the crew picker when {talentName} is on a booking.
        </p>
      ) : (
        <div className="space-y-1.5">
          {preferred.map((p) => {
            const c = p.crew;
            const displayRole = p.role_hint
              ? p.role_hint
              : c?.primary_role
                ? [c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')
                : 'Crew';
            return (
              <div
                key={p.id}
                className="flex items-start justify-between gap-2 rounded border px-3 py-2"
                style={{ borderColor: PALETTE.border, background: PALETTE.bg }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {c ? (
                      <Link
                        href={`/crew/${c.id}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: PALETTE.text }}
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span className="text-xs font-medium" style={{ color: PALETTE.muted }}>(removed)</span>
                    )}
                    <span className="text-[10px]" style={{ color: PALETTE.accent }}>{displayRole}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[10px]" style={{ color: PALETTE.muted }}>
                    {c?.city && <span>{c.city}</span>}
                    {c?.email && <span>{c.email}</span>}
                    {c?.mobile && <span>{c.mobile}</span>}
                  </div>
                  {p.notes && (
                    <div className="mt-1 text-[10px] italic" style={{ color: PALETTE.muted }}>
                      “{p.notes}”
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  disabled={pending}
                  className="text-[10px] disabled:opacity-50"
                  style={{ color: PALETTE.danger, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Remove from preferred"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded px-2 py-1 text-[10px]" style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}>
          {error}
        </div>
      )}
    </section>
  );
}
