"""Exercise the actual migration's tenant isolation and financial invariants."""
import sqlite3, pathlib, unittest
class DatabaseTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for m in sorted(pathlib.Path('migrations').glob('*.sql')):self.db.executescript(m.read_text())
  for u in ['a','b']:
   self.db.execute('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)',(u,u+'@example.com',u,'test'))
   self.db.execute('INSERT INTO properties(id,user_id,name,address,city) VALUES(?,?,?,?,?)',('p'+u,u,'Home','Street','Sofia'))
   self.db.execute('INSERT INTO tenants(id,user_id,name) VALUES(?,?,?)',('t'+u,u,'Tenant'))
  self.db.execute("INSERT INTO leases(id,user_id,property_id,tenant_id,start_date,end_date,rent_cents) VALUES('l','a','pa','ta','2026-01-01','2026-12-31',85000)")
  self.db.execute("INSERT INTO charges(id,user_id,lease_id,month,due_date,amount_cents) VALUES('c','a','l','2026-10','2026-10-01',85000)")
 def payment(self,id,amount,user='a'):
  self.db.execute('INSERT INTO payments(id,user_id,charge_id,amount_cents,paid_date) VALUES(?,?,?,?,?)',(id,user,'c',amount,'2026-10-04'))
 def balance(self):return self.db.execute("SELECT paid_cents FROM charges WHERE id='c'").fetchone()[0]
 def test_partial_payment_and_reversal(self):
  self.payment('one',30000);self.payment('two',55000);self.assertEqual(self.balance(),85000)
  self.db.execute("DELETE FROM payments WHERE id='one'");self.assertEqual(self.balance(),55000)
 def test_overpayment_rejected_without_changing_balance(self):
  self.payment('one',80000)
  with self.assertRaises(sqlite3.IntegrityError):self.payment('two',6000)
  self.assertEqual(self.balance(),80000)
 def test_cross_account_links_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.payment('bad',500,'b')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO maintenance(id,user_id,property_id,title) VALUES('m','a','pb','Bad')")
 def test_month_is_unique(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO charges(id,user_id,lease_id,month,due_date,amount_cents) VALUES('c2','a','l','2026-10','2026-10-01',85000)")
 def test_active_leases_cannot_overlap(self):
  q='INSERT INTO leases(id,user_id,property_id,tenant_id,start_date,end_date,rent_cents) VALUES(?,?,?,?,?,?,?)'
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute(q,('l2','a','pa','ta','2026-12-01','2027-06-30',85000))
  self.db.execute(q,('l3','a','pa','ta','2027-01-01','2027-12-31',85000))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE leases SET end_date='2027-01-15' WHERE id='l'")
  self.db.execute("UPDATE leases SET status='ended' WHERE id='l'")
 def test_voided_charge_rejects_payments(self):
  self.db.execute("UPDATE charges SET voided=1 WHERE id='c'")
  with self.assertRaises(sqlite3.IntegrityError):self.payment('one',100)
 def test_initial_migration_rerun_preserves_existing_payments(self):
  self.payment('one',30000)
  self.db.executescript(pathlib.Path('migrations/0001_initial.sql').read_text())
  self.assertEqual(self.balance(),30000)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM payments').fetchone()[0],1)
  self.payment('two',55000)
  self.assertEqual(self.balance(),85000)
  with self.assertRaises(sqlite3.IntegrityError):self.payment('three',1)
 def test_initial_migration_recovers_partial_import(self):
  sql=pathlib.Path('migrations/0001_initial.sql').read_text()
  with sqlite3.connect(':memory:') as db:
   db.executescript(sql[:sql.index('CREATE TRIGGER')])
   db.execute("INSERT INTO users(id,email,name,password_hash) VALUES('existing','existing@example.com','Existing','test')")
   db.executescript(sql)
   self.assertEqual(db.execute('SELECT id FROM users').fetchall(),[('existing',)])
   self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall(),[('payment_apply',),('payment_limit',),('payment_reverse',)])
   self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='webhook_events'").fetchone())
 def test_account_queries_use_indexes(self):
  for t in ['properties','tenants','leases','charges','payments','maintenance','expenses','files']:
   plan=' '.join(r[3] for r in self.db.execute(f'EXPLAIN QUERY PLAN SELECT * FROM {t} WHERE user_id=?',('a',)))
   self.assertNotIn('SCAN',plan,t)
 def test_money_changes_are_logged(self):
  self.payment('one',30000)
  self.db.execute("DELETE FROM payments WHERE id='one'")
  self.db.execute("UPDATE charges SET voided=1 WHERE id='c'")
  self.db.execute("UPDATE leases SET status='ended' WHERE id='l'")
  rows=self.db.execute("SELECT entity||':'||action FROM audit_log WHERE user_id='a' ORDER BY id").fetchall()
  self.assertEqual([r[0] for r in rows],['lease:created','charge:created','payment:recorded','payment:reversed','charge:voided','lease:ended'])
  self.assertEqual(self.db.execute("SELECT json_extract(detail,'$.property') FROM audit_log WHERE action='recorded'").fetchone()[0],'Home')
 def test_deleting_an_account_removes_everything(self):
  self.db.execute('PRAGMA foreign_keys=ON')
  self.payment('one',30000)
  self.db.execute("DELETE FROM users WHERE id='a'")
  for t in ['properties','tenants','leases','charges','payments','audit_log']:
   self.assertEqual(self.db.execute(f"SELECT COUNT(*) FROM {t} WHERE user_id='a'").fetchone()[0],0,t)
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM properties WHERE user_id='b'").fetchone()[0],1)
 def test_ai_quota_is_atomic(self):
  q='INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count'
  for i in range(5):self.assertEqual(self.db.execute(q,('a','2026-10-04',5)).fetchone()[0],i+1)
  self.assertIsNone(self.db.execute(q,('a','2026-10-04',5)).fetchone())
if __name__=='__main__':unittest.main()
