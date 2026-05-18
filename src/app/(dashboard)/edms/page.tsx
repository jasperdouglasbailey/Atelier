import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listEdms } from '@/lib/data/edms';
import { EDM_TEMPLATE_LABELS } from '@/lib/edms/templates';
import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { createEdmAction } from '@/app/actions/edms';

type SearchParams = Promise<{ status?: string }>;

export default async function EdmsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const group = params.status === 'sent' ? 'sent' : params.status === 'archived' ? 'archived' : 'draft';

  const edms = await listEdms({ status: group });

  return (
    <>
      <Topbar title="EDMs" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: PALETTE.surface }}>
          {(['draft', 'sent', 'archived'] as const).map((g) => (
            <Link
              key={g}
              href={`/edms?status=${g}`}
              className="rounded-md px-4 py-2 text-xs font-medium capitalize transition-colors"
              style={{
                background: group === g ? PALETTE.border : 'transparent',
                color: group === g ? PALETTE.text : PALETTE.muted,
              }}
            >
              {g}
            </Link>
          ))}
        </div>

        {group === 'draft' && (
          <div
            className="mb-5 rounded-lg border p-4"
            style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
          >
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>
              New EDM
            </div>
            <form action={createEdmAction} className="flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[200px]">
                <span className="block text-xs mb-1" style={{ color: PALETTE.muted }}>Title</span>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. October round-up"
                  className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
                  style={{ borderColor: PALETTE.border, color: PALETTE.text }}
                />
              </label>
              <label>
                <span className="block text-xs mb-1" style={{ color: PALETTE.muted }}>Template</span>
                <select
                  name="template"
                  className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
                  style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
                  defaultValue="monthly_roundup"
                >
                  <option value="monthly_roundup">{EDM_TEMPLATE_LABELS.monthly_roundup}</option>
                  <option value="artist_campaign">{EDM_TEMPLATE_LABELS.artist_campaign}</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{ background: PALETTE.accent, color: PALETTE.bg }}
              >
                + New EDM
              </button>
            </form>
          </div>
        )}

        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
        >
          {edms.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
              No {group} EDMs.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: PALETTE.bg, color: PALETTE.muted }} className="text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">{group === 'sent' ? 'Sent' : 'Updated'}</th>
                </tr>
              </thead>
              <tbody>
                {edms.map((e) => (
                  <tr key={e.id} className="border-t" style={{ borderColor: PALETTE.border }}>
                    <td className="px-4 py-3" style={{ color: PALETTE.text }}>
                      <Link href={`/edms/${e.id}`} className="hover:underline font-medium" style={{ color: PALETTE.text }}>
                        {e.title}
                      </Link>
                      {e.subject ? (
                        <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>{e.subject}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: PALETTE.muted }}>
                      {EDM_TEMPLATE_LABELS[e.template]}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: PALETTE.muted }}>
                      {formatDate(group === 'sent' && e.sent_at ? e.sent_at : e.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
