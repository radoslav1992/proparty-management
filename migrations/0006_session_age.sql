-- Sessions are extended while in use (seven days from the last request) and end 30 days after sign-in.
-- Existing sessions were issued for seven days, so their sign-in time is derived from their expiry.
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE sessions SET created_at=expires_at-604800 WHERE created_at=0;
