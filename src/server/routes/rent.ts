import { HttpError, csvCell, month } from "../../lib/domain";
import { generateCharges } from "../../lib/jobs";
import type { Charge } from "../../lib/types";
import { json, readBody } from "../http";
import { del, get, patch, post } from "../router";
import { chargeUpdateInput, monthInput, parse } from "../schemas";

export const rentRoutes = [
  post("charges/generate", async (c) => {
    const input = parse(monthInput, await readBody(c.request));
    await generateCharges(c.db, input.month, c.userId).run();
    return json({ ok: true });
  }),
  patch("charges/:id", async (c, { id }) => {
    const charge = await c.owned<Charge>("charges", id);
    if (charge.voided) throw new HttpError(404, "Record not found.");
    const input = parse(chargeUpdateInput, await readBody(c.request));
    if (input.amount_cents < charge.paid_cents)
      throw new HttpError(
        400,
        "The amount cannot be less than what has already been paid.",
      );
    await c.db
      .prepare(
        "UPDATE charges SET amount_cents=?,due_date=? WHERE id=? AND user_id=?",
      )
      .bind(input.amount_cents, input.due_date, id, c.userId)
      .run();
    return json({ id });
  }),
  // Voided rather than deleted, so monthly generation never recreates it.
  del("charges/:id", async (c, { id }) => {
    const charge = await c.owned<Charge>("charges", id);
    if (charge.voided) throw new HttpError(404, "Record not found.");
    const r = await c.db
      .prepare(
        "UPDATE charges SET voided=1 WHERE id=? AND user_id=? AND paid_cents=0",
      )
      .bind(id, c.userId)
      .run();
    if (!r.meta.changes)
      throw new HttpError(
        409,
        "Reverse this charge's payments before removing it.",
      );
    return json({ ok: true });
  }),
  get("reports", async (c) => {
    const m = month(c.url.searchParams.get("month"));
    const from = m + "-01",
      to = m + "-31";
    const [props, incomeRows, spentRows] = await c.db.batch<any>([
      c.db
        .prepare(
          "SELECT id,name,address FROM properties WHERE user_id=? ORDER BY name",
        )
        .bind(c.userId),
      c.db
        .prepare(
          "SELECT l.property_id AS id,SUM(p.amount_cents) AS n FROM payments p JOIN charges c ON c.id=p.charge_id JOIN leases l ON l.id=c.lease_id WHERE p.user_id=? AND p.paid_date BETWEEN ? AND ? GROUP BY l.property_id",
        )
        .bind(c.userId, from, to),
      c.db
        .prepare(
          "SELECT property_id AS id,SUM(amount_cents) AS n FROM expenses WHERE user_id=? AND expense_date BETWEEN ? AND ? GROUP BY property_id",
        )
        .bind(c.userId, from, to),
    ]);
    const totals = (r: D1Result<{ id: string; n: number }>) =>
      new Map(r.results.map((x) => [x.id, x.n]));
    const income = totals(incomeRows),
      spent = totals(spentRows);
    const rows = [
      [
        "Property",
        "Address",
        "Month",
        "Currency",
        "Rent collected",
        "Expenses",
        "Net cash flow",
      ],
    ];
    for (const p of props.results) {
      const inc = income.get(p.id) || 0,
        exp = spent.get(p.id) || 0;
      rows.push([
        p.name,
        p.address,
        m,
        c.user.currency,
        (inc / 100).toFixed(2),
        (exp / 100).toFixed(2),
        ((inc - exp) / 100).toFixed(2),
      ]);
    }
    return new Response(
      "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="proparty-report-${m}.csv"`,
        },
      },
    );
  }),
];
