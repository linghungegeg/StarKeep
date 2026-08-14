CREATE TABLE IF NOT EXISTS managed_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  owner_login TEXT NOT NULL,
  name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, github_repo_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS managed_repositories_one_default_idx
  ON managed_repositories(user_id) WHERE is_default = true AND enabled = true;

CREATE TABLE IF NOT EXISTS reciprocal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_managed_repository_id UUID NOT NULL REFERENCES managed_repositories(id) ON DELETE CASCADE,
  requester_repository_id UUID NOT NULL REFERENCES managed_repositories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('OWNER_PENDING', 'COMPLETED', 'FAILED')),
  requester_starred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_starred_at TIMESTAMPTZ,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_user_id, source_managed_repository_id)
);

CREATE INDEX IF NOT EXISTS reciprocal_orders_owner_pending_idx
  ON reciprocal_orders(owner_user_id, status, updated_at);
