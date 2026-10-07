import { SESSION_MAX } from "./crypto";
/**
 * SQL for a lease's rent in month `m` (an SQL expression for "YYYY-MM"), reading lease columns from alias `l`.
 * With proration on, a month the lease only partly covers is charged by its share of the month's days.
 */
export const rentForMonth = (m: string) => {
  const first = `${m}||'-01'`,
    last = `date(${m}||'-01','+1 month','-1 day')`;
  return `CASE WHEN l.prorate=1 THEN max(1,CAST(round(l.rent_cents*(julianday(min(l.end_date,${last}))-julianday(max(l.start_date,${first}))+1)/(julianday(${last})-julianday(${first})+1)) AS INTEGER)) ELSE l.rent_cents END`;
};
// Creates one rent charge per active lease covering the month. The due day is moved into the lease's own dates, and existing or voided charges are left alone.
export const generateCharges = (
  db: D1Database,
  month: string,
  userId?: string,
) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO charges(id,user_id,lease_id,month,due_date,amount_cents)
SELECT lower(hex(randomblob(16))),l.user_id,l.id,?1,min(max(?1||'-'||printf('%02d',l.due_day),l.start_date),l.end_date),${rentForMonth("?1")}
FROM leases l WHERE l.status='active' AND substr(l.start_date,1,7)<=?1 AND substr(l.end_date,1,7)>=?1${userId ? " AND l.user_id=?2" : ""}`,
    )
    .bind(...(userId ? [month, userId] : [month]));
/** Re-prices a lease's charges for the given months after its dates or proration change; charges paid beyond the new amount keep theirs. */
export const repriceCharges = (
  db: D1Database,
  leaseId: string,
  userId: string,
  months: string[],
) => {
  const amount = `(SELECT ${rentForMonth("charges.month")} FROM leases l WHERE l.id=charges.lease_id)`;
  return db
    .prepare(
      `UPDATE charges SET amount_cents=${amount},updated_at=CURRENT_TIMESTAMP WHERE lease_id=? AND user_id=? AND voided=0 AND month IN (SELECT value FROM json_each(?)) AND paid_cents<=${amount} AND amount_cents!=${amount}`,
    )
    .bind(leaseId, userId, JSON.stringify(months));
};
// Runs once a day from the Cron Trigger in wrangler.jsonc.
export async function dailyMaintenance(db: D1Database, now = new Date()) {
  const seconds = Math.floor(now.getTime() / 1000),
    day = now.toISOString().slice(0, 10);
  await db.batch([
    generateCharges(db, day.slice(0, 7)),
    // A lease whose last day has passed stops generating charges.
    db
      .prepare(
        "UPDATE leases SET status='ended',updated_at=CURRENT_TIMESTAMP WHERE status='active' AND end_date<?",
      )
      .bind(day),
    db
      .prepare("DELETE FROM sessions WHERE expires_at<=? OR created_at<=?")
      .bind(seconds, seconds - SESSION_MAX),
    db.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(seconds),
    db.prepare("DELETE FROM reset_tokens WHERE expires_at<=?").bind(seconds),
    db.prepare("DELETE FROM verify_tokens WHERE expires_at<=?").bind(seconds),
    db.prepare("DELETE FROM ai_usage WHERE day<date(?,'-30 days')").bind(day),
    db
      .prepare(
        "DELETE FROM webhook_events WHERE created_at<datetime(?,'-30 days')",
      )
      .bind(day),
  ]);
}
