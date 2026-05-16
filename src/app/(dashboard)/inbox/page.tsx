import Topbar from '@/components/layout/Topbar';
import ApprovalQueue from '@/components/approvals/ApprovalQueue';
import PotentialBriefs from '@/components/inbox/PotentialBriefs';
import { listApprovals } from '@/lib/data/approvals';
import { findPotentialBriefs } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { createClient } from '@/lib/supabase/server';
import { PALETTE } from '@/lib/utils/constants';
import { listDismissedBriefIds, listDismissedBriefs } from '@/lib/data/dismissed-briefs';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

type SearchParams = Promise<{ filter?: string }>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = params.filter || 'pending';

  // Fetch all four counts in parallel so the filter chips show numbers.
  // Also fetch dismissed-brief candidates so the "Show dismissed" toggle has data.
  const [pendingList, approvedList, rejectedList, candidates, dismissedBriefs] = await Promise.all([
    listApprovals('pending'),
    listApprovals('approved'),
    listApprovals('rejected'),
    fetchPotentialBriefs(),
    isGoogleConfigured() ? listDismissedBriefs() : Promise.resolve([]),
  ]);

  const allList = [...pendingList, ...approvedList, ...rejectedList];

  const approvals = filter === 'all' ? allList
    : filter === 'pending' ? pendingList
    : filter === 'approved' ? approvedList
    : rejectedList;

  return (
    <>
      <Topbar title="Inbox" />
      <div className="p-4 sm:p-6 space-y-4">

        <KpiStrip>
          <KpiCard
            label="Pending review"
            value={pendingList.length}
            sub="awaiting approve / reject"
            tone={pendingList.length > 0 ? 'warn' : 'success'}
            valueColor={pendingList.length > 0 ? PALETTE.warning : PALETTE.success}
          />
          <KpiCard
            label="Approved"
            value={approvedList.length}
            sub="sent or queued"
          />
          <KpiCard
            label="Rejected"
            value={rejectedList.length}
            sub="declined or expired"
          />
          <KpiCard
            label="Potential briefs"
            value={candidates.length}
            sub={isGoogleConfigured() ? 'Gmail candidates · last 14d' : 'Connect Google to scan inbox'}
            tone={candidates.length > 0 ? 'accent' : 'default'}
          />
        </KpiStrip>

        {/* Potential briefs from Gmail — heuristic, human-in-the-loop.
            Render even when candidates is empty if there are dismissed
            rows to show in the "Show dismissed" toggle. */}
        {isGoogleConfigured() && (candidates.length > 0 || dismissedBriefs.length > 0) && (
          <PotentialBriefs candidates={candidates} dismissed={dismissedBriefs} />
        )}

        {/* Approval queue */}
        <SectionCard
          title="Approval queue"
          meta={
            <span className="flex gap-1">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => {
                const count = f === 'pending' ? pendingList.length
                  : f === 'approved' ? approvedList.length
                  : f === 'rejected' ? rejectedList.length
                  : allList.length;
                const active = filter === f;
                return (
                  <a
                    key={f}
                    href={`/inbox?filter=${f}`}
                    className="rounded-md px-2.5 py-1 text-[10px] font-medium capitalize transition-colors"
                    style={{
                      background: active ? `${PALETTE.accent}22` : 'transparent',
                      color: active ? PALETTE.accent : PALETTE.muted,
                      border: `1px solid ${active ? PALETTE.accent : 'transparent'}`,
                    }}
                  >
                    {f} · {count}
                  </a>
                );
              })}
            </span>
          }
        >
          <ApprovalQueue key={filter} approvals={approvals} />
        </SectionCard>

      </div>
    </>
  );
}

/**
 * Pull context for brief detection.
 */
async function fetchPotentialBriefs() {
  if (!isGoogleConfigured()) return [];
  const supabase = await createClient();

  const [bookingsResult, convertedResult, clientsResult, talentResult, dismissedIds] = await Promise.all([
    // Pull booking refs for dedup'ing brief-detection heuristics. Past
    // 1000 bookings, older refs won't be excluded from "this looks like
    // a new brief" matching — the warning in scanForPotentialBriefs is
    // emitted at run time when we hit the ceiling.
    supabase
      .from('atelier_bookings')
      .select('booking_ref')
      .not('booking_ref', 'is', null)
      .range(0, 999),
    // Bookings already auto-created from Gmail — filter these IDs out
    // server-side so converted emails never reappear in Potential Briefs.
    supabase
      .from('atelier_bookings')
      .select('source_gmail_message_id')
      .not('source_gmail_message_id', 'is', null),
    supabase
      .from('atelier_clients')
      .select('email')
      .not('email', 'is', null),
    supabase
      .from('atelier_talent')
      .select('working_name, nicknames')
      .eq('is_active', true),
    listDismissedBriefIds(),
  ]);

  const bookingRefRows = (bookingsResult.data ?? []) as { booking_ref: string | null }[];
  if (bookingRefRows.length >= 1000) {
    console.warn('[inbox.fetchPotentialBriefs] hit 1000-row ceiling on booking_ref dedup — paginate before this becomes wrong silently');
  }
  const refs = bookingRefRows
    .map((r) => r.booking_ref)
    .filter((r): r is string => Boolean(r));

  const convertedSourceIds = new Set(
    ((convertedResult.data ?? []) as { source_gmail_message_id: string | null }[])
      .map((r) => r.source_gmail_message_id)
      .filter((id): id is string => Boolean(id)),
  );

  const clientEmails = ((clientsResult.data ?? []) as { email: string | null }[])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  // Build the talent-name search corpus: working name + first name (if
  // long enough to disambiguate) + every per-talent nickname. Migration
  // 0057 moved nicknames from a hardcoded map to atelier_talent.nicknames
  // so owners can curate matches without code changes.
  const talentNames: string[] = [];
  for (const { working_name, nicknames } of (talentResult.data ?? []) as { working_name: string; nicknames: string[] | null }[]) {
    if (!working_name) continue;
    talentNames.push(working_name);
    const firstName = working_name.split(' ')[0];
    if (firstName && firstName.length >= 4) talentNames.push(firstName);
    if (Array.isArray(nicknames)) {
      for (const n of nicknames) {
        if (n && n.length >= 2) talentNames.push(n);
      }
    }
  }

  return findPotentialBriefs({
    existingRefs: refs,
    clientEmails,
    talentNames,
    dismissedIds,
    convertedSourceIds,
    limit: 12,
  });
}
