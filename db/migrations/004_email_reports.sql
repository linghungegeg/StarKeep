CREATE TABLE IF NOT EXISTS email_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes IN (1440, 4320, 10080)),
  enabled BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  verification_sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  period_started_at TIMESTAMPTZ NOT NULL,
  period_ended_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  resend_email_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_subscriptions_due_idx ON email_subscriptions(enabled, verified_at, last_sent_at);
CREATE INDEX IF NOT EXISTS email_report_deliveries_user_created_idx ON email_report_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS unstar_actions_user_created_idx ON unstar_actions(user_id, created_at DESC);
