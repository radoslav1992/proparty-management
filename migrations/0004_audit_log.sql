-- When a record last changed. Set by the API on every update; NULL until the first update after this migration.
ALTER TABLE properties ADD COLUMN updated_at TEXT;
ALTER TABLE tenants ADD COLUMN updated_at TEXT;
ALTER TABLE leases ADD COLUMN updated_at TEXT;
ALTER TABLE charges ADD COLUMN updated_at TEXT;
ALTER TABLE maintenance ADD COLUMN updated_at TEXT;
ALTER TABLE expenses ADD COLUMN updated_at TEXT;
-- Append-only history of money and tenancy changes, written by triggers so every path (API, daily job) is captured.
-- One trigger per kind of change: D1's console parser rejects CASE ... END inside trigger bodies.
-- Delete triggers skip rows whose account is being deleted, so the cascade does not log into a removed account.
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,entity TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS audit_user ON audit_log(user_id,id);
CREATE TRIGGER IF NOT EXISTS audit_payment_recorded
AFTER INSERT ON payments
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'payment',NEW.id,'recorded',json_object('amount_cents',NEW.amount_cents,'paid_date',NEW.paid_date,'reference',NEW.reference,'month',c.month,'property',p.name)
  FROM charges c JOIN leases l ON l.id = c.lease_id JOIN properties p ON p.id = l.property_id
  WHERE c.id = NEW.charge_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_payment_reversed
AFTER DELETE ON payments
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT OLD.user_id,'payment',OLD.id,'reversed',json_object('amount_cents',OLD.amount_cents,'paid_date',OLD.paid_date,'reference',OLD.reference,'month',c.month,'property',p.name)
  FROM charges c JOIN leases l ON l.id = c.lease_id JOIN properties p ON p.id = l.property_id
  WHERE c.id = OLD.charge_id AND EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_charge_created
AFTER INSERT ON charges
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'charge',NEW.id,'created',json_object('amount_cents',NEW.amount_cents,'due_date',NEW.due_date,'month',NEW.month,'property',p.name)
  FROM leases l JOIN properties p ON p.id = l.property_id
  WHERE l.id = NEW.lease_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_charge_changed
AFTER UPDATE OF amount_cents, due_date ON charges
WHEN NEW.amount_cents != OLD.amount_cents OR NEW.due_date != OLD.due_date
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'charge',NEW.id,'changed',json_object('amount_cents',NEW.amount_cents,'due_date',NEW.due_date,'old_amount_cents',OLD.amount_cents,'old_due_date',OLD.due_date,'month',NEW.month,'property',p.name)
  FROM leases l JOIN properties p ON p.id = l.property_id
  WHERE l.id = NEW.lease_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_charge_voided
AFTER UPDATE OF voided ON charges
WHEN NEW.voided = 1 AND OLD.voided = 0
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'charge',NEW.id,'voided',json_object('amount_cents',NEW.amount_cents,'month',NEW.month,'property',p.name)
  FROM leases l JOIN properties p ON p.id = l.property_id
  WHERE l.id = NEW.lease_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_charge_deleted
AFTER DELETE ON charges
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT OLD.user_id,'charge',OLD.id,'deleted',json_object('amount_cents',OLD.amount_cents,'month',OLD.month,'property',p.name)
  FROM leases l JOIN properties p ON p.id = l.property_id
  WHERE l.id = OLD.lease_id AND EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_lease_created
AFTER INSERT ON leases
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'lease',NEW.id,'created',json_object('start_date',NEW.start_date,'end_date',NEW.end_date,'rent_cents',NEW.rent_cents,'property',p.name,'tenant',t.name)
  FROM properties p, tenants t
  WHERE p.id = NEW.property_id AND t.id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_lease_changed
AFTER UPDATE OF rent_cents, deposit_cents, due_day, end_date ON leases
WHEN NEW.rent_cents != OLD.rent_cents OR NEW.deposit_cents != OLD.deposit_cents OR NEW.due_day != OLD.due_day OR NEW.end_date != OLD.end_date
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'lease',NEW.id,'changed',json_object('rent_cents',NEW.rent_cents,'old_rent_cents',OLD.rent_cents,'deposit_cents',NEW.deposit_cents,'old_deposit_cents',OLD.deposit_cents,'due_day',NEW.due_day,'old_due_day',OLD.due_day,'end_date',NEW.end_date,'old_end_date',OLD.end_date,'property',p.name,'tenant',t.name)
  FROM properties p, tenants t
  WHERE p.id = NEW.property_id AND t.id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_lease_ended
AFTER UPDATE OF status ON leases
WHEN NEW.status = 'ended' AND OLD.status = 'active'
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'lease',NEW.id,'ended',json_object('end_date',NEW.end_date,'property',p.name,'tenant',t.name)
  FROM properties p, tenants t
  WHERE p.id = NEW.property_id AND t.id = NEW.tenant_id;
END;
