// Calendar dates are YYYY-MM-DD strings in the viewer's own time zone, not UTC.
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Moves a YYYY-MM month by n months.
export const addMonths = (m: string, n: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1))
    .toISOString()
    .slice(0, 7);
// Formats a YYYY-MM month without shifting it into the previous month west of UTC.
export function monthLabel(
  m: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB",
) {
  const date = new Date(m + "-01T12:00:00Z");
  const label = date.toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
  // Some locales (Bulgarian) print a short month on its own as a number; use the start of its name instead.
  if (options.month === "short" && !options.year && /^\d+$/.test(label))
    return (
      date
        .toLocaleDateString(locale, { month: "long", timeZone: "UTC" })
        .slice(0, 3) + "."
    );
  return label;
}
