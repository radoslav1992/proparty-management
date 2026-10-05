-- Account-scoped lookups. Without these, every workspace load scans these tables across all accounts.
CREATE INDEX IF NOT EXISTS tenants_user ON tenants(user_id);
CREATE INDEX IF NOT EXISTS leases_user ON leases(user_id,status);
CREATE INDEX IF NOT EXISTS leases_property ON leases(property_id);
CREATE INDEX IF NOT EXISTS leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id,paid_date);
CREATE INDEX IF NOT EXISTS payments_charge ON payments(charge_id);
CREATE INDEX IF NOT EXISTS maintenance_user ON maintenance(user_id,status);
CREATE INDEX IF NOT EXISTS maintenance_property ON maintenance(property_id);
CREATE INDEX IF NOT EXISTS expenses_user ON expenses(user_id,expense_date);
CREATE INDEX IF NOT EXISTS expenses_property ON expenses(property_id);
