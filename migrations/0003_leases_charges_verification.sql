-- Leases can be entered ahead of time. Overlapping active leases on one property are rejected here instead of by a one-active-lease index.
DROP INDEX IF EXISTS one_active_lease;
CREATE TRIGGER IF NOT EXISTS lease_overlap_insert
BEFORE INSERT ON leases
WHEN NEW.status = 'active' AND EXISTS (
  SELECT 1 FROM leases
  WHERE property_id = NEW.property_id AND status = 'active'
    AND start_date <= NEW.end_date AND end_date >= NEW.start_date
)
BEGIN
  SELECT RAISE(ABORT, 'Lease dates overlap an active lease');
END;
CREATE TRIGGER IF NOT EXISTS lease_overlap_update
BEFORE UPDATE OF status, start_date, end_date ON leases
WHEN NEW.status = 'active' AND EXISTS (
  SELECT 1 FROM leases
  WHERE property_id = NEW.property_id AND status = 'active' AND id != NEW.id
    AND start_date <= NEW.end_date AND end_date >= NEW.start_date
)
BEGIN
  SELECT RAISE(ABORT, 'Lease dates overlap an active lease');
END;
-- Voided charges stay on record so monthly generation never recreates them.
ALTER TABLE charges ADD COLUMN voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1));
CREATE TRIGGER IF NOT EXISTS payment_voided
BEFORE INSERT ON payments
WHEN (SELECT voided FROM charges WHERE id = NEW.charge_id AND user_id = NEW.user_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'Charge is voided');
END;
-- Email verification. Accounts created before this migration count as verified.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
CREATE TABLE IF NOT EXISTS verify_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS verify_tokens_user ON verify_tokens(user_id);
CREATE INDEX IF NOT EXISTS reset_tokens_user ON reset_tokens(user_id);
