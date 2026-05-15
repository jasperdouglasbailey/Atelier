import Topbar from '@/components/layout/Topbar';
import ApprovalQueue from '@/components/approvals/ApprovalQueue';
import PotentialBriefs from '@/components/inbox/PotentialBriefs';
import { listApprovals } from '@/lib/data/approvals';
import { findPotentialBriefs } from '@/lib/integrations/gmail';
import { isGoogleConfigured } from '@/lib/integrations/google-auth';
import { createClient } from '@/lib/supabase/server';
import { PALETTE } from '@/lib/utils/constants';
import KpiCard, { KpiStrip } from '@/components/ui/KpiCard';
import SectionCard from '@/components/ui/SectionCard';

type SearchParams = Promise<{ filter?: string }>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = params.filter || 'pending';

  // Fetch all four counts in parallel so the filter chips show numbers.
  const [pendingList, approvedList, rejectedList, candidates] = await Promise.all([
    listApprovals('pending'),
    listApprovals('approved'),
    listApprovals('rejected'),
    fetchPotentialBriefs(),
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

        {/* Potential briefs from Gmail — heuristic, human-in-the-loop */}
        {isGoogleConfigured() && candidates.length > 0 && (
          <PotentialBriefs candidates={candidates} />
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

  const [bookingsResult, clientsResult, talentResult] = await Promise.all([
    supabase
      .from('atelier_bookings')
      .select('booking_ref')
      .not('booking_ref', 'is', null)
      .limit(500),
    supabase
      .from('atelier_clients')
      .select('email')
      .not('email', 'is', null),
    supabase
      .from('atelier_talent')
      .select('working_name')
      .eq('is_active', true),
  ]);

  const refs = ((bookingsResult.data ?? []) as { booking_ref: string | null }[])
    .map((r) => r.booking_ref)
    .filter((r): r is string => Boolean(r));

  const clientEmails = ((clientsResult.data ?? []) as { email: string | null }[])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  const talentNames: string[] = [];
  for (const { working_name } of (talentResult.data ?? []) as { working_name: string }[]) {
    if (!working_name) continue;
    talentNames.push(working_name);
    const firstName = working_name.split(' ')[0];
    if (firstName && firstName.length >= 4) talentNames.push(firstName);
  }
  const NICKNAMES: Record<string, string[]> = {
    'Oliver': ['Oly'],
  };
  for (const names of Object.values(NICKNAMES)) {
    talentNames.push(...names);
  }

  return findPotentialBriefs({ existingRefs: refs, clientEmails, talentNames, limit: 12 });
}
