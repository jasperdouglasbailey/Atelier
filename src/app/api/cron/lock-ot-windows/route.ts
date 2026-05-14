/**
 * Cron: Lock expired OT/expense windows.
 *
 * Runs daily at 02:00 AEST (16:00 UTC previous day).
 * Finds bookings where ot_expenses_window_end has passed but
 * ot_expenses_locked is still false, and locks them.
 *
 * Protected by CRON_SECRET — Vercel sends this automatically as
 * Authorization: Bearer {CRON_SECRET} on scheduled invocations.
 * Set CRON_SECRET in Vercel env (any strong random string).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/utils/audit';
import { isCronAuthorised } from '@/lib/utils/cron-auth';

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req, 'LOCK_OT_WINDOWS')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await logAudit({ userId: null, action: 'cron_lock_ot_windows_run', tableName: 'atelier_audit_log', newValue: { startedAt: new Date().toISOString() } }).catch(() => {});

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Fetch bookings with expired, unlocked OT windows
  const { data: rows, error: fetchErr } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, ot_expenses_window_end')
    .eq('ot_expenses_locked', false)
    .not('ot_expenses_window_end', 'is', null)
    .lt('ot_expenses_window_end', now);

  if (fetchErr) {
    console.error('[cron/lock-ot-windows] fetch error', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ locked: 0 });
  }

  const ids = rows.map((r) => r.id);

  const { error: updateErr } = await supabase
    .from('atelier_bookings')
    .update({ ot_expenses_locked: true })
    .in('id', ids);

  if (updateErr) {
    console.error('[cron/lock-ot-windows] update error', updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Emit events for audit trail
  const events = ids.map((booking_id) => ({
    booking_id,
    event_type: 'booking.ot_window_locked',
    actor: 'system',
    payload: {},
  }));

  await supabase.from('atelier_events').insert(events);

  console.log(`[cron/lock-ot-windows] locked ${ids.length} booking(s)`, ids);
  await logAudit({ userId: null, action: 'cron_lock_ot_windows_complete', tableName: 'atelier_audit_log', newValue: { locked: ids.length } as never }).catch(() => {});
  return NextResponse.json({ locked: ids.length, ids });
}
