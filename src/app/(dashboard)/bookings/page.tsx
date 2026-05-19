import Link from 'next/link';
import { cookies } from 'next/headers';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import BookingsBoard from '@/components/bookings/BookingsBoard';
import BookingsCalendar from '@/components/bookings/BookingsCalendar';
import BookingsViewToggle from '@/components/bookings/BookingsViewToggle';
import BookingHoverCard from '@/components/bookings/BookingHoverCard';
import ScopePill from '@/components/layout/ScopePill';
import { listBookings } from '@/lib/data/bookings';
import { getCalendarShoots } from '@/lib/data/crew-bookings';
import { getBookingsRoster } from '@/lib/data/booking-roster';
import { getCurrentAppUser } from '@/lib/data/app-users';
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
  /**
   * Roster scope filter — "mine" (default) narrows to bookings where any
   * talent on the team is assigned to the current user. "all" returns
   * everything in the agency. Cookie-persisted via `bookings_scope_pref`.
   * Migration 0069 / Phase 1 multi-agent rollout.
   */
  scope?: string;
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

  // Scope resolution: URL > cookie > default 'mine'. Same pattern as the
  // view toggle. Only meaningful for owners/partners — talent/crew users
  // hit a different layout entirely.
  const scopeCookie = cookieStore.get('bookings_scope_pref')?.value;
  const scope: 'mine' | 'all' =
    params.scope === 'all' ? 'all'
      : params.scope === 'mine' ? 'mine'
      : scopeCookie === 'all' ? 'all'
      : 'mine';
  const currentUser = await getCurrentAppUser();
  // Default to "mine" but only filter if the user has a user_id (which
  // every authenticated owner/partner will). Falls back to "all" silently
  // if for some reason the user isn't resolved — better to show data than
  // to render a blank page.
  const assignedAgentId = scope === 'mine' && currentUser?.user_id
    ? currentUser.user_id
    : undefined;

  // Calendar uses its own data source (one row per booking with attached crew + dates).
  // Board fetches all active bookings (no pagination needed — small N).
  // The bookings calendar is now ALWAYS agency-wide; per-talent and
  // per-crew calendars live on the entity detail pages (/talent/[id],
  // /crew/[id]) instead of being a filter here. Cleaner mental model
  // per Jasper 2026-05-18 — the landing is "agency at a glance"; the
  // detail pages are "individual at a glance".
  const calendarShoots = view === 'calendar' ? await getCalendarShoots() : [];

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
        assignedAgentId,
      });

  // Roster lookup for hover card. Pulled in one batched query for the
  // visible bookings — avoids N+1.
  const visibleIds =
    view === 'calendar'
      ? calendarShoots.map((s) => s.bookingId)
      : bookings.map((b) => b.id);
  const rosterMap = await getBookingsRoster(visibleIds);
  const rosterByBookingId = Object.fromEntries(rosterMap);

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
          {/* Roster scope — "My artists" by default; "All" for sick cover
              and cross-agent coordination. Only matters when there's more
              than one active agent — hidden otherwise. Cookie-persisted. */}
          <ScopePill
            current={scope}
            cookieKey="bookings_scope_pref"
            pathname="/bookings"
            preserveParams={{
              ...(params.view ? { view: params.view } : {}),
              ...(group ? { group } : {}),
              ...(params.tier ? { tier: params.tier } : {}),
            }}
          />
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
          <BookingsCalendar shoots={calendarShoots} rosterByBookingId={rosterByBookingId} />
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
