import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/service';

const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:jasperdouglasbailey@gmail.com';

function isConfigured() {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

if (isConfigured()) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Sends a push notification to every registered subscription for the
 * given user (defaults to all owner/partner subscriptions via service client).
 * Silently removes any expired/invalid subscriptions (HTTP 410).
 */
export async function sendPushToOwners(payload: PushPayload): Promise<void> {
  if (!isConfigured()) return;

  const supabase = createServiceClient();
  const { data: subs } = await supabase
    .from('atelier_push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!subs || subs.length === 0) return;

  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          expired.push(sub.id);
        }
      }
    }),
  );

  if (expired.length > 0) {
    await supabase.from('atelier_push_subscriptions').delete().in('id', expired);
  }
}
