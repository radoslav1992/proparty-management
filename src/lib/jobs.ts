// Creates one rent charge per active lease covering the month. The due day is moved into the lease's own dates, and existing or voided charges are left alone.
export const generateCharges = (
  db: D1Database,
  month: string,
  userId?: string,
) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO charges(id,user_id,lease_id,month,due_date,amount_cents)
SELECT lower(hex(randomblob(16))),user_id,id,?1,min(max(?1||'-'||printf('%02d',due_day),start_date),end_date),rent_cents
FROM leases WHERE status='active' AND substr(start_date,1,7)<=?1 AND substr(end_date,1,7)>=?1${userId ? " AND user_id=?2" : ""}`,
    )
    .bind(...(userId ? [month, userId] : [month]));
// Runs once a day from the Cron Trigger in wrangler.jsonc.
export async function dailyMaintenance(db: D1Database, now = new Date()) {
  const seconds = Math.floor(now.getTime() / 1000),
    day = now.toISOString().slice(0, 10);
  await db.batch([
    generateCharges(db, day.slice(0, 7)),
    // A lease whose last day has passed stops generating charges.
    db
      .prepare(
        "UPDATE leases SET status='ended' WHERE status='active' AND end_date<?",
      )
      .bind(day),
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(seconds),
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
