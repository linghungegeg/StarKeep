ALTER TABLE monitor_policies DROP CONSTRAINT IF EXISTS monitor_policies_interval_minutes_check;
ALTER TABLE monitor_policies ADD CONSTRAINT monitor_policies_interval_minutes_check CHECK (interval_minutes >= 360 AND interval_minutes <= 10080);
