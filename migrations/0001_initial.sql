PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,company TEXT NOT NULL DEFAULT '',currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency IN ('EUR','USD','GBP')),plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','landlord','portfolio')),stripe_customer_id TEXT,stripe_subscription_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reset_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS properties(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'Apartment',bedrooms INTEGER NOT NULL DEFAULT 1 CHECK(bedrooms>=0),area REAL NOT NULL DEFAULT 0 CHECK(area>=0),rent_cents INTEGER NOT NULL DEFAULT 0 CHECK(rent_cents>=0),notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,user_id));
CREATE INDEX IF NOT EXISTS properties_user ON properties(user_id);
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,user_id));
CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,property_id TEXT NOT NULL,tenant_id TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,rent_cents INTEGER NOT NULL CHECK(rent_cents>0),deposit_cents INTEGER NOT NULL DEFAULT 0 CHECK(deposit_cents>=0),due_day INTEGER NOT NULL DEFAULT 1 CHECK(due_day BETWEEN 1 AND 28),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(property_id,user_id) REFERENCES properties(id,user_id),FOREIGN KEY(tenant_id,user_id) REFERENCES tenants(id,user_id),UNIQUE(id,user_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_active_lease ON leases(property_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS charges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,lease_id TEXT NOT NULL,month TEXT NOT NULL,due_date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_cents>=0 AND paid_cents<=amount_cents),FOREIGN KEY(lease_id,user_id) REFERENCES leases(id,user_id),UNIQUE(lease_id,month),UNIQUE(id,user_id));
CREATE INDEX IF NOT EXISTS charges_user ON charges(user_id,month);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,charge_id TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),paid_date TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(charge_id,user_id) REFERENCES charges(id,user_id));
CREATE TRIGGER IF NOT EXISTS payment_limit
BEFORE INSERT ON payments
WHEN NEW.amount_cents > (
  SELECT amount_cents - paid_cents FROM charges
  WHERE id = NEW.charge_id AND user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'Payment exceeds outstanding balance');
END;
CREATE TRIGGER IF NOT EXISTS payment_apply
AFTER INSERT ON payments
BEGIN
  UPDATE charges SET paid_cents = paid_cents + NEW.amount_cents
  WHERE id = NEW.charge_id AND user_id = NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS payment_reverse
AFTER DELETE ON payments
BEGIN
  UPDATE charges SET paid_cents = paid_cents - OLD.amount_cents
  WHERE id = OLD.charge_id AND user_id = OLD.user_id;
END;
CREATE TABLE IF NOT EXISTS maintenance(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,property_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','urgent')),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),assignee TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(property_id,user_id) REFERENCES properties(id,user_id));
CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,property_id TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),expense_date TEXT NOT NULL,FOREIGN KEY(property_id,user_id) REFERENCES properties(id,user_id));
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,property_id TEXT NOT NULL,key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('image','document')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(property_id,user_id) REFERENCES properties(id,user_id));
CREATE INDEX IF NOT EXISTS files_user ON files(user_id,property_id);
CREATE TABLE IF NOT EXISTS ai_usage(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,day TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
