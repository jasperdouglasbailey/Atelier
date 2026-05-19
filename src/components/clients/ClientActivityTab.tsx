/**
 * Activity timeline for the client detail page.
 *
 * Queries `atelier_audit_log` for rows where `record_id = clientId` — i.e.
 * mutations on the client record itself (update, anonymise, contact added).
 * Phase A scope: just the client-record audit. Phase C will fold in
 * booking-created / email-sent rows that reference this client_id in
 * `metadata`, so the timeline reads like "everything that happened for
 * Marie Claire."
 *
 * Server component. Renders newest-first, ties broken by id.
 */

import { createClient } from '@/lib/supabase/server';
import type { AuditLogRow } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';

type Props = { clientId: string };

const ACTION_LABELS: Record<string, string> = {
  create: 'Client created',
  update: 'Client updated',
  delete: 'Client deleted',
  anonymise: 'Anonymised (GDPR)',
  export_data: 'Data export requested',
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export default async function ClientActivityTab({ clientId }: Props) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('atelier_audit_log')
    .select('*')
    .eq('record_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <p className="text-xs" style={{ color: PALETTE.muted }}>Couldn&rsquo;t load activity ({error.message}).</p>
      </section>
    );
  }

  const rows = (data ?? []) as AuditLogRow[];

  if (rows.length === 0) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <p className="text-xs" style={{ color: PALETTE.muted }}>No activity recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <ul className="divide-y" style={{ borderColor: PALETTE.border }}>
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                {labelFor(row.action)}
              </div>
              <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                {row.table_name}
              </div>
            </div>
            <div className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: PALETTE.muted }}>
              {formatDateTime(row.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
