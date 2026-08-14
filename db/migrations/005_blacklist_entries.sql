CREATE TABLE IF NOT EXISTS blacklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_login TEXT NOT NULL UNIQUE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detection_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS blacklist_entries_detected_idx ON blacklist_entries(detected_at DESC);
