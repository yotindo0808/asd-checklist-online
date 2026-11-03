-- Netlify managed Postgres; questionnaire results must not be used as diagnosis.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,window_start BIGINT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,locked_until BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,invite_hash TEXT NOT NULL UNIQUE,label TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('preschool','lower_elementary','upper_elementary_plus')),
  recipient TEXT NOT NULL CHECK (recipient IN ('家長','教師','其他')),
  code_hash TEXT,code_failures INTEGER NOT NULL DEFAULT 0,code_locked_until BIGINT NOT NULL DEFAULT 0,
  respondent_hash TEXT,respondent_expires_at BIGINT,created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,delete_after BIGINT NOT NULL,revoked_at BIGINT,
  submitted_at BIGINT,downloaded_at BIGINT,draft_json TEXT,answer_json TEXT);
CREATE INDEX IF NOT EXISTS idx_asd_inv_delete_after ON invitations(delete_after);
CREATE INDEX IF NOT EXISTS idx_asd_inv_respondent ON invitations(respondent_hash);
CREATE INDEX IF NOT EXISTS idx_asd_inv_created ON invitations(created_at DESC);