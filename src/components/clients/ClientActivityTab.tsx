/**
 * Activity timeline for the client detail page.
 *
 * Phase C: merges two sources so the timeline reads like "everything
 * that happened for Marie Claire":
 *
 *   1. Direct mutations on the client record — `atelier_audit_log`
 *      rows where `record_id = clientId`. Captures things like
 *      "Client created", "Client updated", "Anonymised (GDPR)".
 *
 *   2. Bookings that reference this client — `atelier_bookings` rows
 *      where `client_id = clientId`. Each one becomes a "Booking
 *      created: <ref>" entry. Far cheaper than scanning the audit log
 *      for the related ids, and bookings.created_at is the canonical
 *      timestamp anyway.
 *
 * Future expansion (Phase D-ish): emails sent (atelier_comms with
 * `to ILIKE '%client.email%'` or `metadata->>client_id = clientId`).
 * Skipped for now — comms metadata doesn't reliably carry client_id
 * yet, and Jasper said don't build until demanded.
 *
 * Server component. Newest first; ties broken by id for stability.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { AuditLogRow } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';

type Props = { clientId: string };

type TimelineItem =
  | { kind: 'audit'; id: string; created_at: string; label: string; sub: string | null }
  | { kind: 'booking'; id: string; created_at: string; label: string; sub: string | null; href: string };

const ACTION_LABELS: Record<string, string> = {
  create: 'Client created',
  update: 'Client updated',
  delete: 'Client deleted',
  anonymise: 'Anonymised (GDPR)',
  export_data: 'Data export requested',
};

function labelFor(row: AuditLogRow): string {
  // Staff-tab saves come through as action='update' with a `kind: 'staff_update'`
  // marker in the payload (the audit-entity action enum is fixed). Surface them
  // distinctly here so "Staff updated" reads better than a generic update row.
  const nv = row.new_value as Record<string, unknown> | null;
  if (row.action === 'update' && nv && nv.kind === 'staff_update') return 'Staff updated';
  return ACTION_LABELS[row.action] ?? row.action.replace(/_/g, ' ');
}

export default async function ClientActivityTab({ clientId }: Props) {
  const supabase = await createClient();

  const [auditRes, bookingsRes] = await Promise.all([
    supabase
      .from('atelier_audit_log')
      .select('*')
      .eq('record_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('atelier_bookings')
      .select('id, created_at, booking_ref, title')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (auditRes.error) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <p className="text-xs" style={{ color: PALETTE.muted }}>Couldn&rsquo;t load activity ({auditRes.error.message}).</p>
      </section>
    );
  }

  const auditRows = (auditRes.data ?? []) as AuditLogRow[];
  const bookingRows = (bookingsRes.data ?? []) as Array<{ id: string; created_at: string; booking_ref: string | null; title: string }>;

  const items: TimelineItem[] = [
    ...auditRows.map((row): TimelineItem => ({
      kind: 'audit',
      id: row.id,
      created_at: row.created_at,
      label: labelFor(row),
      sub: row.table_name,
    })),
    ...bookingRows.map((b): TimelineItem => ({
      kind: 'booking',
      id: b.id,
      created_at: b.created_at,
      label: `Booking created: ${b.booking_ref ?? b.title}`,
      sub: b.booking_ref ? b.title : null,
      href: `/bookings/${b.id}`,
    })),
  ].sort((a, b) => {
    const tDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (tDiff !== 0) return tDiff;
    return a.id.localeCompare(b.id);
  });

  if (items.length === 0) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <p className="text-xs" style={{ color: PALETTE.muted }}>No activity recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <ul className="divide-y" style={{ borderColor: PALETTE.border }}>
        {items.map((item) => {
          const inner = (
            <div className="px-4 py-2.5 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                  {item.label}
                </div>
                {item.sub && (
                  <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                    {item.sub}
                  </div>
                )}
              </div>
              <div className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: PALETTE.muted }}>
                {formatDateTime(item.created_at)}
              </div>
            </div>
          );
          if (item.kind === 'booking') {
            return (
              <li key={`b-${item.id}`}>
                <Link href={item.href} className="block hover:bg-opacity-50 transition-colors" style={{ color: 'inherit' }}>
                  {inner}
                </Link>
              </li>
            );
          }
          return <li key={`a-${item.id}`}>{inner}</li>;
        })}
      </ul>
    </section>
  );
}
