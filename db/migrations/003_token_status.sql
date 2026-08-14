ALTER TABLE github_credentials ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ;
