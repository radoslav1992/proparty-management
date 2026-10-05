// Calendar dates are YYYY-MM-DD strings in the viewer's own time zone, not UTC.
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Formats a YYYY-MM month without shifting it into the previous month west of UTC.
export const monthLabel = (m: string, options: Intl.DateTimeFormatOptions) =>
  new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });
