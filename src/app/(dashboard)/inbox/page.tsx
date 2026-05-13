import Topbar from '@/components/layout/Topbar';
import ApprovalQueue from '@/components/approvals/ApprovalQueue';
import PotentialBriefs from '@/components/inbox/PotentialBriefs';
import { listApprovals } from '@/lib/data/approvals';
import { findPotentialBriefs } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { createClient } from '@/lib/supabase/server';
import { PALETTE } from '@/lib/utils/constants';

type SearchParams = Promise<{ filter?: string }>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = params.filter || 'pending';

  const [approvals, candidates] = await Promise.all([
    listApprovals(filter === 'all' ? undefined : (filter as 'pending' | 'approved' | 'rejected')),
    fetchPotentialBriefs(),
  ]);

  return (
    <>
      <Topbar title="Inbox" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* Potential briefs — Gmail messages that look like inbound briefs.
            Heuristic-based, human-in-the-loop convert to booking. */}
        {isGoogleConfigured() && (
          <PotentialBriefs candidates={candidates} />
        )}

        {/* Approval queue — pending automated emails awaiting Jasper's review */}
        <div>
          <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: PALETTE.surface }}>
            {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
              <a
                key={f}
                href={`/inbox?filter=${f}`}
                className="rounded-md px-4 py-2 text-xs font-medium capitalize transition-colors"
                style={{
                  background: filter === f ? PALETTE.border : 'transparent',
                  color: filter === f ? PALETTE.text : PALETTE.muted,
                }}
              >
                {f}
              </a>
            ))}
          </div>

          <ApprovalQueue key={filter} approvals={approvals} />
        </div>
      </div>
    </>
  );
}

/**
 * Pull existing booking refs so we can exclude already-converted emails
 * from the candidate list. Limited to active bookings — old refs almost
 * never appear as fresh briefs.
 */
async function fetchPotentialBriefs() {
  if (!isGoogleConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('atelier_bookings')
    .select('booking_ref')
    .not('booking_ref', 'is', null)
    .limit(500);
  const refs = ((data ?? []) as { booking_ref: string | null }[])
    .map((r) => r.booking_ref)
    .filter((r): r is string => Boolean(r));
  return findPotentialBriefs({ existingRefs: refs, limit: 12 });
}
