/**
 * Converts raw event_type + payload into concise, human-readable descriptions
 * for the dashboard activity feed and booking timeline.
 *
 * Payload shapes are as-emitted — kept loose (Record<string, unknown>) so
 * this doesn't need to be updated every time a new event field is added.
 */

import { BOOKING_STATE_LABELS } from '@/lib/utils/constants';

// Loose lookup that accepts any string key
function stateLabel(s: string | undefined): string | null {
  if (!s) return null;
  return (BOOKING_STATE_LABELS as Record<string, string>)[s] ?? s;
}

const STATUS_LABELS: Record<string, string> = {
  hold_requested: 'Hold requested',
  sent: 'Hold sent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  released: 'Released',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  crew_hold_request: 'crew hold request',
  quote_send: 'quote send',
  invoice_send: 'invoice send',
};

export type EventDescription = {
  /** One-line primary label */
  label: string;
  /** Optional secondary line (state change, from→to, count, etc.) */
  detail?: string;
};

export function describeEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): EventDescription {
  switch (eventType) {
    case 'booking.created':
      return {
        label: 'Booking created',
        detail: (payload.title as string | undefined) ?? undefined,
      };

    case 'booking.state_changed': {
      const from = payload.from as string | undefined;
      const to = payload.to as string | undefined;
      const fromLabel = stateLabel(from);
      const toLabel = stateLabel(to);
      return {
        label: toLabel ? `→ ${toLabel}` : 'State changed',
        detail: fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : undefined,
      };
    }

    case 'booking.updated':
      return { label: 'Booking updated' };

    case 'approval.approved': {
      const actionType = payload.action_type as string | undefined;
      const label = actionType ? ACTION_TYPE_LABELS[actionType] ?? actionType : 'item';
      return { label: `Approval granted — ${label}` };
    }

    case 'approval.rejected': {
      const actionType = payload.action_type as string | undefined;
      const label = actionType ? ACTION_TYPE_LABELS[actionType] ?? actionType : 'item';
      return { label: `Approval rejected — ${label}` };
    }

    case 'crew.status_change': {
      const from = STATUS_LABELS[payload.from as string] ?? (payload.from as string);
      const to = STATUS_LABELS[payload.to as string] ?? (payload.to as string);
      return {
        label: 'Crew status updated',
        detail: from && to ? `${from} → ${to}` : undefined,
      };
    }

    case 'crew.hold_request_sent':
      return { label: 'Hold request approved — crew notified' };

    case 'crew_holds.proposed': {
      const created = payload.created as number | undefined;
      const skipped = payload.skipped as number | undefined;
      const parts: string[] = [];
      if (created != null) parts.push(`${created} new`);
      if (skipped) parts.push(`${skipped} already queued`);
      return {
        label: 'Hold requests proposed',
        detail: parts.length ? parts.join(' · ') : undefined,
      };
    }

    default: {
      // Fallback: prettify the event type string
      const pretty = eventType
        .split('.')
        .map((s) => s.replace(/_/g, ' '))
        .join(' · ');
      return { label: pretty };
    }
  }
}
