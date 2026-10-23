-- 0.7.35: when each session was last used, shown in Settings → Account → Active sessions.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
