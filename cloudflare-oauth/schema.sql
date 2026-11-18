-- Separate pilot database. Never run against an existing application database.
CREATE TABLE IF NOT EXISTS oauth_flows (
  state_hash TEXT PRIMARY KEY, flow_hash TEXT NOT NULL, profile TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, wants_drive INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_flows_expiry ON oauth_flows(expires_at);
CREATE TABLE IF NOT EXISTS google_connections (
  profile TEXT NOT NULL, google_sub TEXT NOT NULL, email TEXT NOT NULL,
  token_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, has_drive INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(profile, google_sub)
);
CREATE TABLE IF NOT EXISTS app_sessions (
  session_hash TEXT PRIMARY KEY, profile TEXT NOT NULL, google_sub TEXT NOT NULL,
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires_at);
CREATE INDEX IF NOT EXISTS app_sessions_connection ON app_sessions(profile,google_sub);
CREATE TABLE IF NOT EXISTS oauth_rate_limits (
  bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
