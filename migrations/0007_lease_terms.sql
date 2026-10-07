-- Optional proration of partial first and last months, renewals linked to the lease they continue,
-- and a record of when the deposit was received and how much of it was returned.
ALTER TABLE leases ADD COLUMN prorate INTEGER NOT NULL DEFAULT 0 CHECK(prorate IN (0,1));
ALTER TABLE leases ADD COLUMN renewed_from TEXT;
ALTER TABLE leases ADD COLUMN deposit_received_on TEXT;
ALTER TABLE leases ADD COLUMN deposit_returned_cents INTEGER CHECK(deposit_returned_cents>=0);
ALTER TABLE leases ADD COLUMN deposit_returned_on TEXT;
-- A lease is renewed at most once; the renewal carries the deposit forward.
CREATE UNIQUE INDEX IF NOT EXISTS leases_renewal ON leases(renewed_from) WHERE renewed_from IS NOT NULL;
-- Renewals are logged as such.
DROP TRIGGER IF EXISTS audit_lease_created;
CREATE TRIGGER IF NOT EXISTS audit_lease_created
AFTER INSERT ON leases
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'lease',NEW.id,'created',json_object('start_date',NEW.start_date,'end_date',NEW.end_date,'rent_cents',NEW.rent_cents,'renewal',NEW.renewed_from IS NOT NULL,'prorate',NEW.prorate,'property',p.name,'tenant',t.name)
  FROM properties p, tenants t
  WHERE p.id = NEW.property_id AND t.id = NEW.tenant_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_lease_deposit
AFTER UPDATE OF deposit_received_on, deposit_returned_cents, deposit_returned_on ON leases
WHEN NEW.deposit_received_on IS NOT OLD.deposit_received_on OR NEW.deposit_returned_cents IS NOT OLD.deposit_returned_cents OR NEW.deposit_returned_on IS NOT OLD.deposit_returned_on
BEGIN
  INSERT INTO audit_log(user_id,entity,entity_id,action,detail)
  SELECT NEW.user_id,'lease',NEW.id,'deposit',json_object('deposit_cents',NEW.deposit_cents,'received_on',NEW.deposit_received_on,'returned_cents',NEW.deposit_returned_cents,'returned_on',NEW.deposit_returned_on,'property',p.name,'tenant',t.name)
  FROM properties p, tenants t
  WHERE p.id = NEW.property_id AND t.id = NEW.tenant_id;
END;
