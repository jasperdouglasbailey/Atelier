import Link from 'next/link';
import { cookies } from 'next/headers';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import BookingsBoard from '@/components/bookings/BookingsBoard';
import BookingsCalendar from '@/components/bookings/BookingsCalendar';
import BookingsViewToggle from '@/components/bookings/BookingsViewToggle';
import BookingHoverCard from '@/components/bookings/BookingHoverCard';
import CalendarTalentFilter from '@/components/bookings/CalendarTalentFilter';
import { listBookings } from '@/lib/data/bookings';
import { listTalent } from '@/lib/data/entities';
import { getCalendarShoots } from '@/lib/data/crew-bookings';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, STATE_COLORS, PALETTE } from '@/lib/utils/constants';
import { formatBookingTitle } from '@/lib/utils/booking-title';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { BookingState, ShootTier } from '@/lib/types/database';

type SearchParams = Promise<{
  state?: string;
  group?: string;
  tier?: string;
  search?: string;
  page?: string;
  view?: string;
  /** Calendar talent filter — UUID of a single talent. Only applies when view=calendar. */
  talent?: string;
}>;

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  // View resolution order:
  //   1. ?view= URL param wins (sticky link sharing)
  //   2. bookings_view_pref cookie (last user choice)
  //   3. Default to 'calendar' (per session 7 doctrine — calendar is the
  //      primary mental model for a producer's day)
  const cookieStore = await cookies();
  const viewCookie = cookieStore.get('bookings_view_pref')?.value;
  const view: 'list' | 'board' | 'calendar' =
    params.view === 'list' ? 'list'
      : params.view === 'board' ? 'board'
      : params.view === 'calendar' ? 'calendar'
      : viewCookie === 'list' ? 'list'
      : viewCookie === 'board' ? 'board'
      : 'calendar';
  const group = params.group || 'active';
  const showArchived = group === 'archived';

  // Calendar uses its own data source (one row per booking with attached crew + dates).
  // Board fetches all active bookings (no pagination needed — small N).
  const allCalendarShoots = view === 'calendar' ? await getCalendarShoots() : [];

  // Talent filter — only meaningful on the calendar view. When set, we
  // narrow `calendarShoots` to bookings that include this talent in
  // their roster, AND we pre-fetch the talent list for the dropdown.
  const talentFilterId = view === 'calendar' && params.talent ? params.talent : null;
  const allTalentForFilter = view === 'calendar'
    ? await listTalent().then((rows) => rows.filter((t) => t.is_active))
    : [];

  const { bookings, total, pageSize } = view === 'calendar'
    ? { bookings: [], total: 0, pageSize: 20 }
    : await listBookings({
        state: params.state as BookingState | undefined,
        stateGroup: showArchived
          ? undefined
          : view === 'board' ? 'active' : (params.group as 'active' | 'completed' | 'lost') || 'active',
        tier: params.tier as ShootTier | undefined,
        search: params.search,
        page: view === 'board' ? 1 : page,
        pageSize: view === 'board' ? 200 : 20,
        archivedOnly: showArchived,
      });

  // Roster lookup for hover card. Pulled in one batched query for the
  // visible bookings — avoids N+1. We also use the full roster (not the
  // post-filter list) to drive the talent filter, so even bookings
  // hidden by the filter still contribute to its dropdown options.
  const visibleIds =
    view === 'calendar'
      ? allCalendarShoots.map((s) => s.bookingId)
      : bookings.map((b) => b.id);
  const rosterMap = await getBookingsRoster(visibleIds);
  const rosterByBookingId = Object.fromEntries(rosterMap);

  // Apply talent filter AFTER fetching roster — needs the roster to
  // know which bookings include the talent.
  const calendarShoots = talentFilterId
    ? allCalendarShoots.filter((shoot) => {
        const roster = rosterMap.get(shoot.bookingId);
        return roster?.talent.some((t) => t.id === talentFilterId) ?? false;
      })
    : allCalendarShoots;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Topbar title="Bookings" />
      <div className="p-4 sm:p-6">
        {/* Toolbar */}
        <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: PALETTE.surface }}>
          {view === 'list' && (['active', 'completed', 'lost', 'archived'] as const).map((g) => (
            <Link
              key={g}
              href={`/bookings?view=list&group=${g}`}
              className="rounded-md px-4 py-2 text-xs font-medium capitalize transition-colors"
              style={{
                background: group === g ? PALETTE.border : 'transparent',
                color: group === g ? PALETTE.text : PALETTE.muted,
              }}
            >
              {g}
            </Link>
          ))}
          <div className="flex-1" />
          {/* View toggle — Calendar → Board → List, persists choice to cookie */}
          <BookingsViewToggle
            current={view}
            preserveParams={{ group, ...(params.tier ? { tier: params.tier } : {}) }}
          />
          <Link
            href="/bookings/new"
            className="rounded-md px-4 py-2 text-xs font-medium ml-1"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            + New Booking
          </Link>
        </div>

        {view === 'calendar' ? (
          <>
            {/* Talent filter — surfaces the bookings calendar from one
                talent's POV. When set, only their bookings render. The
                full talent list comes from active roster, not the
                currently-visible bookings, so you can pick any talent. */}
            <CalendarTalentFilter
              talent={allTalentForFilter.map((t) => ({ id: t.id, name: t.working_name }))}
              selectedId={talentFilterId}
            />
            <BookingsCalendar shoots={calendarShoots} rosterByBookingId={rosterByBookingId} />
          </>
        ) : view === 'board' ? (
          <BookingsBoard bookings={bookings} />
        ) : (
          <>
            {/* Search + tier filter */}
            <ListSearchBar
              searchValue={params.search}
              searchPlaceholder="Search by ref, title or client…"
              hiddenParams={{ group, view: 'list', ...(params.tier ? { tier: params.tier } : {}) }}
              filters={
                <select
                  name="tier"
                  defaultValue={params.tier ?? ''}
                  className="rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
                >
                  <option value="">All tiers</option>
                  {Object.entries(SHOOT_TIER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              }
              count={total}
              countLabel="booking"
            />

            {/* Table */}
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ background: PALETTE.bg, color: PALETTE.muted }} className="text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3">Booking</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
                        {params.search ? 'No bookings match your search.' : 'No bookings yet. Create one to get started.'}
                      </td>
                    </tr>
                  )}
                  {bookings.map((b) => {
                    const clientName = b.client?.company || b.client?.name || null;
                    const talentNames = (b.booking_talent ?? [])
                      .map((bt) => bt.talent?.name)
                      .filter((n): n is string => typeof n === 'string' && n.length > 0);
                    const displayTitle = formatBookingTitle({
                      bookingRef: b.booking_ref ?? null,
                      talentNames,
                      clientName,
                      title: b.title,
                    });
                    return (
                      <tr key={b.id} className="border-t" style={{ borderColor: PALETTE.border }}>
                        <td className="px-4 py-3" style={{ color: PALETTE.text }}>
                          <BookingHoverCard
                            bookingRef={b.booking_ref ?? null}
                            title={b.title}
                            state={b.state}
                            clientName={clientName}
                            roster={rosterByBookingId[b.id] ?? null}
                          >
                            <Link
                              href={`/bookings/${b.id}`}
                              className="hover:underline font-medium"
                              style={{ color: PALETTE.text }}
                            >
                              {displayTitle}
                            </Link>
                          </BookingHoverCard>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{
                              background: `${STATE_COLORS[b.state]}22`,
                              color: STATE_COLORS[b.state],
                            }}
                          >
                            {BOOKING_STATE_LABELS[b.state]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: PALETTE.muted }}>
                          {SHOOT_TIER_LABELS[b.tier]}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: PALETTE.text }}>
                          {b.grand_total > 0 ? formatCurrency(b.grand_total, 'AUD') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: PALETTE.muted }}>
                          {formatDate(b.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-xs" style={{ color: PALETTE.muted }}>
              <span>{total} booking{total === 1 ? '' : 's'}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/bookings?view=list&group=${group}&page=${page - 1}${params.search ? `&search=${params.search}` : ''}`}
                    className="rounded-md border px-3 py-1.5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/bookings?view=list&group=${group}&page=${page + 1}${params.search ? `&search=${params.search}` : ''}`}
                    className="rounded-md border px-3 py-1.5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
