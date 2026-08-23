ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN elevated_until TEXT;
ALTER TABLE clients ADD COLUMN expires_after_inactivity_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oidc_pending_sessions ADD COLUMN client_id INTEGER;
ALTER TABLE oidc_pending_sessions ADD COLUMN duration_seconds INTEGER;
