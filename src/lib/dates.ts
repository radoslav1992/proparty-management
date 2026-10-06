// Calendar dates are YYYY-MM-DD strings in the viewer's own time zone, not UTC.
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Moves a YYYY-MM month by n months.
export const addMonths = (m: string, n: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1))
    .toISOString()
    .slice(0, 7);
// Formats a YYYY-MM month without shifting it into the previous month west of UTC.
export const monthLabel = (m: string, options: Intl.DateTimeFormatOptions) =>
  new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });
