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
 * Pull context for brief detection: existing booking refs (to exclude
 * already-converted emails), client emails (always surface emails from
 * known clients), and talent names/nicknames (surface emails asking about
 * specific artists by name).
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

  // Include both full working names and first names as separate search tokens.
  // "Oliver Begg" catches full-name mentions; "Oliver" + "Oly" catches
  // informal references. Keep first names only when they're specific enough
  // (≥4 chars) to avoid noisy single-syllable matches.
  const talentNames: string[] = [];
  for (const { working_name } of (talentResult.data ?? []) as { working_name: string }[]) {
    if (!working_name) continue;
    talentNames.push(working_name);
    const firstName = working_name.split(' ')[0];
    if (firstName && firstName.length >= 4) talentNames.push(firstName);
  }
  // Add known nicknames — extend this list as needed.
  const NICKNAMES: Record<string, string[]> = {
    'Oliver': ['Oly'],
  };
  for (const names of Object.values(NICKNAMES)) {
    talentNames.push(...names);
  }

  return findPotentialBriefs({ existingRefs: refs, clientEmails, talentNames, limit: 12 });
}
