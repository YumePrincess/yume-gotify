ALTER TABLE users ADD COLUMN oidc_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_id
  ON users (oidc_id);

CREATE TABLE IF NOT EXISTS oidc_pending_sessions (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  client_name TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  flow TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oidc_pending_sessions_expires_at
  ON oidc_pending_sessions (expires_at);
