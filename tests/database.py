"""Exercise the actual migration's tenant isolation and financial invariants."""
import sqlite3, pathlib, unittest
class DatabaseTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript(pathlib.Path('migrations/0001_initial.sql').read_text())
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
 def test_only_one_active_lease_per_property(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO leases(id,user_id,property_id,tenant_id,start_date,end_date,rent_cents) VALUES('l2','a','pa','ta','2026-01-01','2026-12-31',85000)")
 def test_ai_quota_is_atomic(self):
  q='INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count'
  for i in range(5):self.assertEqual(self.db.execute(q,('a','2026-10-04',5)).fetchone()[0],i+1)
  self.assertIsNone(self.db.execute(q,('a','2026-10-04',5)).fetchone())
if __name__=='__main__':unittest.main()
