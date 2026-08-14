ALTER TABLE tracked_repositories
  ADD COLUMN IF NOT EXISTS ever_mutual BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE monitor_policies
  ALTER COLUMN auto_unstar_enabled SET DEFAULT true;

UPDATE tracked_repositories
SET ever_mutual = true
WHERE relationship_status = 'MUTUAL';

UPDATE monitor_policies
SET auto_unstar_enabled = true, updated_at = now()
WHERE auto_unstar_enabled = false;
