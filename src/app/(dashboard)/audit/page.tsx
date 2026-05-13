import Topbar from '@/components/layout/Topbar';
import { listAudit } from '@/lib/utils/audit';
import { formatDateTime } from '@/lib/utils/format';
import { PALETTE } from '@/lib/utils/constants';
import Link from 'next/link';

type SearchParams = Promise<{
  page?: string;
  action?: string;
  table?: string;
  from?: string;
  to?: string;
}>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const { rows, total, pageSize } = await listAudit({
    page,
    pageSize: 25,
    action: params.action || undefined,
    tableName: params.table || undefined,
    fromDate: params.from || undefined,
    toDate: params.to || undefined,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const inputStyle: React.CSSProperties = {
    background: PALETTE.bg,
    borderColor: PALETTE.border,
    color: PALETTE.text,
  };

  const buildPageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (p > 1) sp.set('page', String(p));
    if (params.action) sp.set('action', params.action);
    if (params.table) sp.set('table', params.table);
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    const qs = sp.toString();
    return qs ? `/audit?${qs}` : '/audit';
  };

  return (
    <>
      <Topbar title="Audit" />
      <div className="p-4 sm:p-6">
        <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-xs" style={{ color: PALETTE.muted }}>
            From
            <input type="date" name="from" defaultValue={params.from} className="rounded-md border px-2 py-1 text-xs" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: PALETTE.muted }}>
            To
            <input type="date" name="to" defaultValue={params.to} className="rounded-md border px-2 py-1 text-xs" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: PALETTE.muted }}>
            Action
            <input
              type="text"
              name="action"
              placeholder="e.g. update"
              defaultValue={params.action}
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: PALETTE.muted }}>
            Table
            <input
              type="text"
              name="table"
              placeholder="e.g. bookings"
              defaultValue={params.table}
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            Apply
          </button>
          <Link
            href="/audit"
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{ borderColor: PALETTE.border, color: PALETTE.muted }}
          >
            Reset
          </Link>
        </form>

        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
        >
          <table className="min-w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wide border-b"
                style={{ background: PALETTE.bg, color: PALETTE.muted, borderColor: PALETTE.border }}
              >
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: PALETTE.muted }}>
                    No audit entries match the current filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isFailure = r.action.endsWith('_failed');
                return (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{
                      borderColor: PALETTE.border,
                      background: isFailure ? `${PALETTE.danger}08` : undefined,
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: PALETTE.muted }}>
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: PALETTE.text }}>
                      {r.user_id ?? <span style={{ color: PALETTE.muted }}>system</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <code style={{ color: isFailure ? PALETTE.danger : PALETTE.accent }}>{r.action}</code>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: PALETTE.text }}>{r.table_name}</td>
                    <td className="px-4 py-3 font-mono text-[11px]" style={{ color: PALETTE.muted }}>
                      {r.record_id ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ChangeSummary oldValue={r.old_value} newValue={r.new_value} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs" style={{ color: PALETTE.muted }}>
          <span>
            {total === 0 ? '0 entries' : `Showing page ${page} of ${totalPages} · ${total} total`}
          </span>
          <div className="flex gap-2">
            <Link
              aria-disabled={page <= 1}
              href={buildPageHref(Math.max(1, page - 1))}
              className="rounded-md border px-3 py-1.5"
              style={{
                borderColor: PALETTE.border,
                color: page <= 1 ? PALETTE.border : PALETTE.text,
                pointerEvents: page <= 1 ? 'none' : 'auto',
              }}
            >
              Previous
            </Link>
            <Link
              aria-disabled={page >= totalPages}
              href={buildPageHref(Math.min(totalPages, page + 1))}
              className="rounded-md border px-3 py-1.5"
              style={{
                borderColor: PALETTE.border,
                color: page >= totalPages ? PALETTE.border : PALETTE.text,
                pointerEvents: page >= totalPages ? 'none' : 'auto',
              }}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function ChangeSummary({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  if (!oldValue && !newValue) {
    return <span style={{ color: PALETTE.muted }}>—</span>;
  }
  const summary = JSON.stringify(newValue ?? oldValue);
  const truncated = summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;
  return (
    <code className="text-[11px]" style={{ color: PALETTE.muted }}>
      {truncated}
    </code>
  );
}
