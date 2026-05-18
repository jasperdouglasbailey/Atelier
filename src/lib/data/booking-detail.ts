/**
 * Orchestration layer for the booking detail page.
 *
 * Bundles the 9+ parallel data fetches into one call so the page stays
 * focused on rendering. The precedent signals (corpus aggregations) are
 * intentionally NOT included — they stream in via Suspense to avoid
 * blocking the initial paint.
 */

import { getBooking, type BookingDetailRow } from '@/lib/data/bookings';
import {
  listQuoteVersions, getLatestQuoteVersion, listFeeLinesForBooking,
  listBookingTalent, listBookingCrew, getTalentRatePrecedents,
  type RatePrecedent,
} from '@/lib/data/quotes';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { withTiming } from '@/lib/utils/perf-trace';
import { getCachedActiveTalent, getCachedActiveCrew } from '@/lib/data/entities-cache';
import { listPreferredCrewIds } from '@/lib/data/talent-preferred-crew';
import { getCrewBookedOnRange } from '@/lib/data/crew-bookings';
import { getCrewUnavailabilityForRange, getTalentUnavailabilityForRange } from '@/lib/data/portal';
import { listBookingSchedules } from '@/lib/data/booking-schedules';
import { listEvents } from '@/lib/utils/events';
import { parseDateRangeRaw } from '@/lib/utils/daterange';
import type { QuoteVersion, FeeLine, UsageLicence, Talent, Crew, BookingSchedule } from '@/lib/types/database';

export type CrewConflict = {
  bookingId: string;
  bookingRef: string | null;
  title: string;
  start: string;
  end: string;
};

export type BookingDetailData = {
  booking: BookingDetailRow;
  events: Awaited<ReturnType<typeof listEvents>>;
  quoteVersions: QuoteVersion[];
  latestQuote: QuoteVersion | null;
  feeLines: FeeLine[];
  bookingTalent: Awaited<ReturnType<typeof listBookingTalent>>;
  bookingCrew: Awaited<ReturnType<typeof listBookingCrew>>;
  usageLicences: UsageLicence[];
  allTalent: Talent[];
  allCrew: Crew[];
  preferredCrewIds: string[];
  ratePrecedents: RatePrecedent[];
  crewConflictsByCrewId: Record<string, CrewConflict[]>;
  talentUnavailByTalentId: Record<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>;
  schedules: BookingSchedule[];
};

export async function getBookingDetail(id: string): Promise<BookingDetailData | null> {
  // PERF_TRACE_ENABLED=1 turns on per-step timing logs. Off by default
  // so production isn't permanently noisy. See src/lib/utils/perf-trace.
  const totalStart = performance.now();
  const booking = await withTiming('booking-detail.getBooking', () => getBooking(id));
  if (!booking) return null;

  // Compute shoot range for conflict lookup (needs booking.shoot_dates).
  const shootRange = parseDateRangeRaw(booking.shoot_dates);
  let crewConflictsEnd = shootRange.end;
  if (shootRange.end) {
    const d = new Date(shootRange.end + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    crewConflictsEnd = d.toISOString().slice(0, 10);
  }

  // Fire everything that only depends on bookingId / shoot_dates in parallel.
  const [
    events, quoteVersions, latestQuote, feeLines,
    bookingTalent, bookingCrew, usageLicences, allTalent, allCrew,
    rawConflicts, crewUnavailability, talentUnavailability, schedules,
  ] = await Promise.all([
    withTiming('booking-detail.listEvents', () => listEvents({ bookingId: id, limit: 30 })),
    withTiming('booking-detail.listQuoteVersions', () => listQuoteVersions(id)),
    withTiming('booking-detail.getLatestQuoteVersion', () => getLatestQuoteVersion(id)),
    withTiming('booking-detail.listFeeLines', () => listFeeLinesForBooking(id)),
    withTiming('booking-detail.listBookingTalent', () => listBookingTalent(id)),
    withTiming('booking-detail.listBookingCrew', () => listBookingCrew(id)),
    withTiming('booking-detail.listUsageLicences', () => listUsageLicences(id)),
    withTiming('booking-detail.getCachedActiveTalent', () => getCachedActiveTalent()),
    withTiming('booking-detail.getCachedActiveCrew', () => getCachedActiveCrew()),
    shootRange.start
      ? withTiming('booking-detail.getCrewBookedOnRange', () => getCrewBookedOnRange({
          startDate: shootRange.start!,
          endDate: crewConflictsEnd ?? shootRange.start!,
          excludeBookingId: id,
        }))
      : Promise.resolve(new Map<string, CrewConflict[]>()),
    shootRange.start
      ? withTiming('booking-detail.getCrewUnavailability', () =>
          getCrewUnavailabilityForRange(shootRange.start!, crewConflictsEnd ?? shootRange.start!))
      : Promise.resolve(new Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>()),
    shootRange.start
      ? withTiming('booking-detail.getTalentUnavailability', () =>
          getTalentUnavailabilityForRange(shootRange.start!, crewConflictsEnd ?? shootRange.start!))
      : Promise.resolve(new Map<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>>()),
    withTiming('booking-detail.listBookingSchedules', () => listBookingSchedules(id)),
  ]);

  // Talent-dependent: fire once we know the primary artist.
  const primaryTalentId = bookingTalent[0]?.talent_id ?? null;
  const [preferredCrewIds, ratePrecedents] = await Promise.all([
    primaryTalentId
      ? withTiming('booking-detail.listPreferredCrewIds', () => listPreferredCrewIds(primaryTalentId))
      : Promise.resolve([]),
    primaryTalentId
      ? withTiming('booking-detail.getTalentRatePrecedents', () => getTalentRatePrecedents(primaryTalentId, id))
      : Promise.resolve([]),
  ]);

  if (process.env.PERF_TRACE_ENABLED === '1') {
    console.log(`[perf] booking-detail.TOTAL ${(performance.now() - totalStart).toFixed(1)}ms id=${id}`);
  }

  const crewConflictsByCrewId: Record<string, CrewConflict[]> = {};
  for (const [crewId, bookings] of rawConflicts) {
    crewConflictsByCrewId[crewId] = bookings;
  }
  // Merge self-reported crew unavailability blocks into the conflict map.
  for (const [crewId, blocks] of crewUnavailability) {
    const existing = crewConflictsByCrewId[crewId] ?? [];
    for (const block of blocks) {
      existing.push({
        bookingId: '',
        bookingRef: null,
        title: block.reason ? `Unavailable — ${block.reason}` : 'Unavailable (self-reported)',
        start: block.dateFrom,
        end: block.dateTo,
      });
    }
    crewConflictsByCrewId[crewId] = existing;
  }

  const talentUnavailByTalentId: Record<string, Array<{ dateFrom: string; dateTo: string; reason: string | null }>> = {};
  for (const [talentId, blocks] of talentUnavailability) {
    talentUnavailByTalentId[talentId] = blocks;
  }

  return {
    booking,
    events,
    quoteVersions,
    latestQuote,
    feeLines,
    bookingTalent,
    bookingCrew,
    usageLicences,
    allTalent,
    allCrew,
    preferredCrewIds,
    ratePrecedents,
    crewConflictsByCrewId,
    talentUnavailByTalentId,
    schedules,
  };
}
