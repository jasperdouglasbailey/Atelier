import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import ListSearchBar from '@/components/layout/ListSearchBar';
import BookingsBoard from '@/components/bookings/BookingsBoard';
import BookingsCalendar from '@/components/bookings/BookingsCalendar';
import { listBookings } from '@/lib/data/bookings';
import { getCalendarShoots } from '@/lib/data/crew-bookings';
import { BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, STATE_COLORS, PALETTE } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { BookingState, ShootTier } from '@/lib/types/database';

type SearchParams = Promise<{
  state?: string;
  group?: string;
  tier?: string;
  search?: string;
  page?: string;
  view?: string;
}>;

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const view: 'list' | 'board' | 'calendar' =
    params.view === 'board' ? 'board' : params.view === 'calendar' ? 'calendar' : 'list';
  const group = params.group || 'active';

  // Calendar uses its own data source (one row per booking with attached crew + dates).
  // Board fetches all active bookings (no pagination needed — small N).
  const calendarShoots = view === 'calendar' ? await getCalendarShoots() : [];

  const { bookings, total, pageSize } = view === 'calendar'
    ? { bookings: [], total: 0, pageSize: 20 }
    : await listBookings({
        state: params.state as BookingState | undefined,
        stateGroup: view === 'board' ? 'active' : (params.group as 'active' | 'completed' | 'lost') || 'active',
        tier: params.tier as ShootTier | undefined,
        search: params.search,
        page: view === 'board' ? 1 : page,
        pageSize: view === 'board' ? 200 : 20,
      });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Topbar title="Bookings" />
      <div className="p-4 sm:p-6">
        {/* Toolbar */}
        <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: PALETTE.surface }}>
          {view === 'list' && (['active', 'completed', 'lost'] as const).map((g) => (
            <Link
              key={g}
              href={`/bookings?group=${g}`}
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
          {/* View toggle */}
          <Link
            href={`/bookings?view=list&group=${group}`}
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: view === 'list' ? PALETTE.border : 'transparent', color: view === 'list' ? PALETTE.text : PALETTE.muted }}
            title="List view"
          >
            ≡
          </Link>
          <Link
            href="/bookings?view=board"
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: view === 'board' ? PALETTE.border : 'transparent', color: view === 'board' ? PALETTE.text : PALETTE.muted }}
            title="Board view"
          >
            ⊞
          </Link>
          <Link
            href="/bookings?view=calendar"
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: view === 'calendar' ? PALETTE.border : 'transparent', color: view === 'calendar' ? PALETTE.text : PALETTE.muted }}
            title="Calendar view"
          >
            ▦
          </Link>
          <Link
            href="/bookings/new"
            className="rounded-md px-4 py-2 text-xs font-medium ml-1"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            + New Booking
          </Link>
        </div>

        {view === 'calendar' ? (
          <BookingsCalendar shoots={calendarShoots} />
        ) : view === 'board' ? (
          <BookingsBoard bookings={bookings} />
        ) : (
          <>
            {/* Search + tier filter */}
            <ListSearchBar
              searchValue={params.search}
              searchPlaceholder="Search by ref, title or client…"
              hiddenParams={{ group, ...(params.tier ? { tier: params.tier } : {}) }}
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
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
                        {params.search ? 'No bookings match your search.' : 'No bookings yet. Create one to get started.'}
                      </td>
                    </tr>
                  )}
                  {bookings.map((b) => {
                    const clientName = b.client?.company || b.client?.name || null;
                    return (
                      <tr key={b.id} className="border-t" style={{ borderColor: PALETTE.border }}>
                        <td className="px-4 py-3">
                          <Link href={`/bookings/${b.id}`} className="font-mono text-xs" style={{ color: PALETTE.accent }}>
                            {b.booking_ref ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3" style={{ color: PALETTE.text }}>
                          <Link href={`/bookings/${b.id}`} className="hover:underline">
                            {b.title}
                          </Link>
                          {(() => {
                            const primaryArtist = b.booking_talent?.[0]?.talent;
                            return primaryArtist ? (
                              <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.accent }}>
                                {primaryArtist.name}
                                {primaryArtist.discipline && (
                                  <span className="ml-1" style={{ color: PALETTE.muted }}>· {primaryArtist.discipline}</span>
                                )}
                              </div>
                            ) : b.talent_spec ? (
                              <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>
                                {b.talent_spec}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: clientName ? PALETTE.muted : '#404560' }}>
                          {clientName ?? '—'}
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
                    href={`/bookings?group=${group}&page=${page - 1}${params.search ? `&search=${params.search}` : ''}`}
                    className="rounded-md border px-3 py-1.5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/bookings?group=${group}&page=${page + 1}${params.search ? `&search=${params.search}` : ''}`}
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
