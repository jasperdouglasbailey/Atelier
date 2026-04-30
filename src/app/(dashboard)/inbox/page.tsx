import Topbar from '@/components/layout/Topbar';
import ApprovalQueue from '@/components/approvals/ApprovalQueue';
import { listApprovals } from '@/lib/data/approvals';
import { PALETTE } from '@/lib/utils/constants';

type SearchParams = Promise<{ filter?: string }>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = params.filter || 'pending';
  const approvals = await listApprovals(
    filter === 'all' ? undefined : (filter as 'pending' | 'approved' | 'rejected'),
  );

  return (
    <>
      <Topbar title="Inbox" />
      <div className="p-4 sm:p-6">
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

        <ApprovalQueue approvals={approvals} />
      </div>
    </>
  );
}
