'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingTalent, BookingCrew, Talent, Crew } from '@/lib/types/database';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import {
  addBookingTalentAction, removeBookingTalentAction,
  addBookingCrewAction, removeBookingCrewAction,
  substituteTalentAction,
} from '@/app/actions/quotes';
import CrewStatusSelect from './CrewStatusSelect';
import CrewDayPicker from './CrewDayPicker';

type Props = {
  bookingId: string;
  bookingTalent: BookingTalent[];
  bookingCrew: BookingCrew[];
  allTalent: Talent[];
  allCrew: Crew[];
  /** All shoot days for this booking (ISO YYYY-MM-DD). When length > 1, the per-day picker is shown for each crew row. */
  shootDays?: string[];
  /** Free-text shoot location — used to surface local crew first. */
  shootLocation?: string | null;
  /**
   * Map of crew_id → list of conflicting bookings. Crew members in this
   * map get a soft "already booked on …" warning in both the attached
   * roster and the add-dropdown.
   */
  crewConflictsByCrewId?: Record<string, Array<{ bookingId: string; bookingRef: string | null; title: string; start: string; end: string }>>;
  /**
   * Map of talent_id → self-reported unavailability blocks. Talent in
   * this map get a soft amber warning in the attached roster and add-dropdown.
   */
  talentUnavailByTalentId?: Record<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>;
  /**
   * Crew IDs preferred by the primary artist on this booking. Surfaced
   * at the top of the add-crew dropdown with a ★ marker so producers
   * see the artist's go-to people first.
   */
  preferredCrewIds?: string[];
  /** Primary artist's name — used in the "★ Oliver's preferred" group label. */
  primaryTalentName?: string | null;
};

/**
 * Detect whether a crew member's home city is mentioned in the shoot
 * location string. Case-insensitive substring match — good enough for
 * "Sydney" / "Melbourne" / "Byron Bay" / "Gold Coast" / etc.
 */
function isLocalCrew(crewCity: string | null | undefined, shootLocation: string | null | undefined): boolean {
  if (!crewCity || !shootLocation) return false;
  const haystack = shootLocation.toLowerCase();
  // Crew city can be "Byron Bay/Gold Coast" — split on slash and try each token.
  return crewCity
    .toLowerCase()
    .split(/[/,]/)
    .some((token) => token.trim().length > 0 && haystack.includes(token.trim()));
}

export default function BookingTeam({ bookingId, bookingTalent, bookingCrew, allTalent, allCrew, shootDays = [], shootLocation, crewConflictsByCrewId = {}, talentUnavailByTalentId = {}, preferredCrewIds = [], primaryTalentName = null }: Props) {
  const isMultiDay = shootDays.length > 1;
  const preferredSet = useMemo(() => new Set(preferredCrewIds), [preferredCrewIds]);
  const router = useRouter();
  const [showAddTalent, setShowAddTalent] = useState(false);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [talentDayRate, setTalentDayRate] = useState('');
  const [crewDayRate, setCrewDayRate] = useState('');

  // Build lookup maps for fast rate pre-fill
  const talentById = Object.fromEntries(allTalent.map(t => [t.id, t]));
  const crewById = Object.fromEntries(allCrew.map(c => [c.id, c]));

  // Sort attached crew so local crew (city matches shoot location) come first.
  // Within each group, keep insertion order so the user's manual order is
  // preserved.
  const sortedBookingCrew = useMemo(() => {
    if (!shootLocation) return bookingCrew;
    return [...bookingCrew].sort((a, b) => {
      const aLocal = isLocalCrew(a.crew?.city, shootLocation) ? 0 : 1;
      const bLocal = isLocalCrew(b.crew?.city, shootLocation) ? 0 : 1;
      return aLocal - bLocal;
    });
  }, [bookingCrew, shootLocation]);

  // Sort order for the "Add Crew" dropdown:
  //   1. Primary artist's preferred crew (their go-to people, ★)
  //   2. Local crew (matches shoot location)
  //   3. Alphabetical fallback
  // The picker then renders preferred crew in a labelled <optgroup> so
  // they're visually separated from everyone else.
  const sortedAvailableCrew = useMemo(() => {
    const filtered = allCrew.filter((c) => c.is_active && c.tier !== 'never_again');
    return [...filtered].sort((a, b) => {
      const aPref = preferredSet.has(a.id) ? 0 : 1;
      const bPref = preferredSet.has(b.id) ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      const aLocal = isLocalCrew(a.city, shootLocation) ? 0 : 1;
      const bLocal = isLocalCrew(b.city, shootLocation) ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
      return a.name.localeCompare(b.name);
    });
  }, [allCrew, shootLocation, preferredSet]);

  // Split for the <optgroup> render — preferred first, the rest below.
  const preferredCrewList = sortedAvailableCrew.filter((c) => preferredSet.has(c.id));
  const otherCrewList = sortedAvailableCrew.filter((c) => !preferredSet.has(c.id));

  async function handleAddTalent(formData: FormData) {
    setBusy(true);
    await addBookingTalentAction(formData);
    setShowAddTalent(false);
    setTalentDayRate('');
    router.refresh();
    setBusy(false);
  }

  async function handleRemoveTalent(id: string) {
    setBusy(true);
    await removeBookingTalentAction(id, bookingId);
    router.refresh();
    setBusy(false);
  }

  // Substitution state
  const [substituteFor, setSubstituteFor] = useState<string | null>(null); // booking_talent id
  const [subReason, setSubReason] = useState('');
  const [subNewTalentId, setSubNewTalentId] = useState('');
  const [subDayRate, setSubDayRate] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  function openSubstitute(btId: string) {
    setSubstituteFor(btId);
    setSubReason('');
    setSubNewTalentId('');
    setSubDayRate('');
    setSubError(null);
  }

  async function handleSubstitute() {
    if (!substituteFor) return;
    if (!subNewTalentId) { setSubError('Select a replacement.'); return; }
    if (!subReason.trim()) { setSubError('Reason is required.'); return; }
    setSubBusy(true);
    setSubError(null);
    const result = await substituteTalentAction({
      bookingId,
      oldBookingTalentId: substituteFor,
      newTalentId: subNewTalentId,
      reason: subReason.trim(),
      dayRate: subDayRate ? Number(subDayRate) : undefined,
    });
    setSubBusy(false);
    if ('error' in result) {
      setSubError(result.error);
    } else {
      setSubstituteFor(null);
      router.refresh();
    }
  }

  async function handleAddCrew(formData: FormData) {
    setBusy(true);
    const result = await addBookingCrewAction(formData);
    setBusy(false);
    if ('error' in result && result.error) {
      // The data layer rejects "never_again" tier here — surface the message.
      alert(result.error);
      return;
    }
    setShowAddCrew(false);
    setCrewDayRate('');
    router.refresh();
  }

  async function handleRemoveCrew(id: string) {
    setBusy(true);
    await removeBookingCrewAction(id, bookingId);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* Talent */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">
            Talent ({bookingTalent.length})
          </h3>
          <button
            onClick={() => setShowAddTalent(!showAddTalent)}
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
          >
            {showAddTalent ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAddTalent && (
          <form action={handleAddTalent} className="mb-3 space-y-2 rounded border p-2" style={{ borderColor: PALETTE.border }}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <select
              name="talent_id"
              required
              className="w-full rounded border px-2 py-1 text-xs"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              onChange={(e) => {
                const t = talentById[e.target.value];
                setTalentDayRate(t?.default_day_rate != null ? String(t.default_day_rate) : '');
              }}
            >
              <option value="">Select talent...</option>
              {allTalent.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>
                  {t.working_name}{talentUnavailByTalentId[t.id]?.length ? ' ⚠ Unavailable' : ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input name="role_on_booking" required placeholder="Role" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
              <input
                name="day_rate"
                type="number"
                step="0.01"
                placeholder="Day rate"
                value={talentDayRate}
                onChange={(e) => setTalentDayRate(e.target.value)}
                className="rounded border px-2 py-1 text-xs"
                style={{
                  background: PALETTE.bg,
                  borderColor: talentDayRate ? PALETTE.accent : PALETTE.border,
                  color: PALETTE.text,
                }}
              />
              <input name="usage_fee" type="number" step="0.01" placeholder="Usage fee" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
            <button type="submit" disabled={busy} className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
              Add Talent
            </button>
          </form>
        )}

        {bookingTalent.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>No talent assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {bookingTalent.map((bt) => {
              const t = bt.talent;
              const isSubbing = substituteFor === bt.id;
              // Available replacements — exclude talent already on this booking
              const bookedTalentIds = new Set(bookingTalent.map((r) => r.talent_id));
              const replacements = allTalent.filter((tl) => tl.is_active && !bookedTalentIds.has(tl.id));
              return (
                <div key={bt.id} className="rounded border" style={{ borderColor: isSubbing ? PALETTE.warning : PALETTE.border }}>
                  <div className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                        {t?.working_name ?? 'Unknown'}
                        {bt.role_on_booking && (
                          <span className="ml-2 text-[10px]" style={{ color: PALETTE.muted }}>{humanise(bt.role_on_booking)}</span>
                        )}
                      </div>
                      {/* Fees live in the quote — this row is just "who's on the booking" */}
                      <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                        {bt.confirmed ? 'Confirmed' : 'Pencilled'}
                      </div>
                      {bt.talent_id && talentUnavailByTalentId[bt.talent_id]?.length > 0 && (
                        <div className="text-[10px] mt-0.5" style={{ color: PALETTE.warning }}>
                          ⚠ Unavailable (self-reported)
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/print/bookings/${bookingId}/artist/${bt.talent_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px]"
                        style={{ color: PALETTE.accent }}
                      >
                        ↗ Remittance
                      </a>
                      {!isSubbing && (
                        <button
                          onClick={() => openSubstitute(bt.id)}
                          className="text-[10px]"
                          style={{ color: PALETTE.warning }}
                        >
                          Substitute
                        </button>
                      )}
                      <button onClick={() => handleRemoveTalent(bt.id)} className="text-[10px]" style={{ color: PALETTE.danger }}>Remove</button>
                    </div>
                  </div>

                  {/* Inline substitution form */}
                  {isSubbing && (
                    <div className="border-t px-3 py-3 space-y-2" style={{ borderColor: PALETTE.border, background: `${PALETTE.warning}08` }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.warning }}>
                        Substituting {t?.working_name ?? 'this talent'}
                      </div>
                      <select
                        value={subNewTalentId}
                        onChange={(e) => setSubNewTalentId(e.target.value)}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
                      >
                        <option value="">— Select replacement —</option>
                        {replacements.map((tl) => (
                          <option key={tl.id} value={tl.id}>{tl.working_name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={subReason}
                        onChange={(e) => setSubReason(e.target.value)}
                        placeholder="Reason for substitution (e.g. illness, scheduling conflict)"
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
                      />
                      <input
                        type="number"
                        value={subDayRate}
                        onChange={(e) => setSubDayRate(e.target.value)}
                        placeholder={`Day rate (leave blank to keep ${bt.day_rate ? `$${bt.day_rate}` : 'current'})`}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
                      />
                      {subError && (
                        <div className="text-[11px]" style={{ color: PALETTE.danger }}>{subError}</div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSubstitute}
                          disabled={subBusy}
                          className="rounded px-3 py-1 text-xs font-semibold"
                          style={{ background: PALETTE.warning, color: '#000', opacity: subBusy ? 0.6 : 1 }}
                        >
                          {subBusy ? 'Substituting…' : 'Confirm substitution'}
                        </button>
                        <button
                          onClick={() => setSubstituteFor(null)}
                          className="text-[11px]"
                          style={{ color: PALETTE.muted }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Crew */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">
            Crew ({bookingCrew.length})
          </h3>
          <button
            onClick={() => setShowAddCrew(!showAddCrew)}
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
          >
            {showAddCrew ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAddCrew && (
          <form action={handleAddCrew} className="mb-3 space-y-2 rounded border p-2" style={{ borderColor: PALETTE.border }}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <select
              name="crew_id"
              required
              className="w-full rounded border px-2 py-1 text-xs"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              onChange={(e) => {
                const c = crewById[e.target.value];
                setCrewDayRate(c?.default_day_rate != null ? String(c.default_day_rate) : '');
              }}
            >
              <option value="">Select crew member...</option>
              {preferredCrewList.length > 0 && (
                <optgroup label={primaryTalentName ? `★ ${primaryTalentName}'s preferred crew` : '★ Preferred crew'}>
                  {preferredCrewList.map((c) => {
                    const local = isLocalCrew(c.city, shootLocation);
                    const cityHint = c.city ? (local ? ` · ${c.city} (local)` : ` · ${c.city}`) : '';
                    const roleLabel = c.primary_role
                      ? [c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')
                      : 'General';
                    const conflicts = crewConflictsByCrewId[c.id];
                    const conflictHint = conflicts && conflicts.length > 0
                      ? ` ⚠ already on ${conflicts[0].bookingRef ?? conflicts[0].title}`
                      : '';
                    return (
                      <option key={c.id} value={c.id}>{c.name} — {roleLabel}{cityHint}{conflictHint}</option>
                    );
                  })}
                </optgroup>
              )}
              <optgroup label={preferredCrewList.length > 0 ? 'All crew' : 'Crew'}>
                {otherCrewList.map((c) => {
                  const local = isLocalCrew(c.city, shootLocation);
                  const cityHint = c.city ? (local ? ` · ${c.city} (local)` : ` · ${c.city}`) : '';
                  const roleLabel = c.primary_role
                    ? [c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')
                    : 'General';
                  const conflicts = crewConflictsByCrewId[c.id];
                  const conflictHint = conflicts && conflicts.length > 0
                    ? ` ⚠ already on ${conflicts[0].bookingRef ?? conflicts[0].title}`
                    : '';
                  return (
                    <option key={c.id} value={c.id}>{c.name} — {roleLabel}{cityHint}{conflictHint}</option>
                  );
                })}
              </optgroup>
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input name="role_on_booking" placeholder="Role on booking" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
              <input
                name="day_rate"
                type="number"
                step="0.01"
                placeholder="Day rate"
                value={crewDayRate}
                onChange={(e) => setCrewDayRate(e.target.value)}
                className="rounded border px-2 py-1 text-xs"
                style={{
                  background: PALETTE.bg,
                  borderColor: crewDayRate ? PALETTE.accent : PALETTE.border,
                  color: PALETTE.text,
                }}
              />
            </div>
            <button type="submit" disabled={busy} className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
              Add Crew
            </button>
          </form>
        )}

        {bookingCrew.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>No crew assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedBookingCrew.map((bc) => {
              const c = bc.crew;
              const local = isLocalCrew(c?.city, shootLocation);
              const conflicts = bc.crew_id ? crewConflictsByCrewId[bc.crew_id] : undefined;
              // Free-text role on this booking takes priority; fall back to the
              // crew member's stored primary role. Both go through humanise so
              // "digital_operator" reads as "Digital operator".
              const roleDisplay = bc.role_on_booking
                ? humanise(bc.role_on_booking)
                : (c?.primary_role
                  ? [c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')
                  : null);
              return (
                <div key={bc.id} className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.border }}>
                  <div>
                    <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                      {c?.name ?? 'Unknown'}
                      {roleDisplay && <span className="ml-2 text-[10px]" style={{ color: PALETTE.muted }}>{roleDisplay}</span>}
                      {c?.city && (
                        <span
                          className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                          style={
                            local
                              ? { background: `${PALETTE.success}22`, color: PALETTE.success }
                              : { background: `${PALETTE.muted}18`, color: PALETTE.muted }
                          }
                          title={local ? 'Crew is based in the shoot city' : 'Crew is based in another city'}
                        >
                          {c.city}{local ? ' · local' : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: PALETTE.muted }}>
                      {/* Fees live in the quote — only show booking-relevant status here */}
                      <CrewStatusSelect bookingCrewId={bc.id} bookingId={bookingId} status={bc.status} />
                      {c?.tier && <span>{CREW_TIER_LABELS[c.tier]}</span>}
                    </div>
                    {conflicts && conflicts.length > 0 && (
                      <div
                        className="mt-1.5 rounded px-2 py-1 text-[10px]"
                        style={{ background: `${PALETTE.warning}18`, color: PALETTE.warning }}
                        title={conflicts.map((c) => `${c.bookingRef ?? c.title} (${c.start}${c.end !== c.start ? ' – ' + c.end : ''})`).join('\n')}
                      >
                        ⚠ Also on {conflicts.map((c) => c.bookingRef ?? c.title).join(', ')}
                      </div>
                    )}
                    {isMultiDay && (
                      <CrewDayPicker
                        bookingCrewId={bc.id}
                        bookingId={bookingId}
                        shootDays={shootDays}
                        assignedDates={bc.assigned_dates}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/print/bookings/${bookingId}/crew/${bc.crew_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px]"
                      style={{ color: PALETTE.accent }}
                    >
                      ↗ Bill
                    </a>
                    <button onClick={() => handleRemoveCrew(bc.id)} className="text-[10px]" style={{ color: PALETTE.danger }}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
