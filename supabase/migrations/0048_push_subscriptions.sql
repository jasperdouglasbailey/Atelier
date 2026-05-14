-- Web Push subscriptions — one row per browser/device per user.
-- Stores the VAPID push endpoint and key material.
CREATE TABLE IF NOT EXISTS atelier_push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atelier_push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

-- Only the owning user can read/write their own subscription.
ALTER TABLE atelier_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_owner"
  ON atelier_push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service-role (server actions, crons) needs unrestricted read for send.
CREATE POLICY "push_subscriptions_service"
  ON atelier_push_subscriptions
  FOR SELECT
  USING (auth.role() = 'service_role');
