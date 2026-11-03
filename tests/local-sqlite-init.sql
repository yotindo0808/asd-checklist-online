-- No scoring tables. All identifiers and answer records are temporary.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  invite_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('preschool','lower_elementary','upper_elementary_plus')),
  recipient TEXT NOT NULL CHECK (recipient IN ('家長','教師','其他')),
  code_hash TEXT,
  code_failures INTEGER NOT NULL DEFAULT 0,
  code_locked_until INTEGER NOT NULL DEFAULT 0,
  respondent_hash TEXT,
  respondent_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  delete_after INTEGER NOT NULL,
  revoked_at INTEGER,
  submitted_at INTEGER,
  downloaded_at INTEGER,
  draft_json TEXT,
  answer_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_invitations_delete_after ON invitations(delete_after);
CREATE INDEX IF NOT EXISTS idx_invitations_respondent_hash ON invitations(respondent_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at DESC);