CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT NOT NULL UNIQUE,
  login TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitor_policies (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK (interval_minutes >= 360 AND interval_minutes <= 10080),
  consecutive_failures_required INTEGER NOT NULL DEFAULT 3 CHECK (consecutive_failures_required >= 2 AND consecutive_failures_required <= 10),
  auto_unstar_enabled BOOLEAN NOT NULL DEFAULT false,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS target_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  owner_login TEXT NOT NULL,
  name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, github_repo_id)
);

CREATE TABLE IF NOT EXISTS tracked_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  owner_login TEXT NOT NULL,
  name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  whitelisted BOOLEAN NOT NULL DEFAULT false,
  relationship_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (relationship_status IN ('MUTUAL', 'NOT_MUTUAL', 'UNKNOWN')),
  consecutive_not_mutual INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  unstarred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, github_repo_id)
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  checked_count INTEGER NOT NULL DEFAULT 0,
  mutual_count INTEGER NOT NULL DEFAULT 0,
  not_mutual_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS unstar_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracked_repository_id UUID NOT NULL REFERENCES tracked_repositories(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('MANUAL', 'AUTOMATIC')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracked_repositories_user_active_idx ON tracked_repositories(user_id, enabled) WHERE unstarred_at IS NULL;
CREATE INDEX IF NOT EXISTS target_repositories_user_selected_idx ON target_repositories(user_id, selected);
CREATE INDEX IF NOT EXISTS scan_runs_user_started_idx ON scan_runs(user_id, started_at DESC);
