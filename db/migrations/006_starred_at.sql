ALTER TABLE tracked_repositories
  ADD COLUMN IF NOT EXISTS starred_at TIMESTAMPTZ;
