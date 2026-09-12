/**
 * Dates and times, in one place.
 *
 * Pure, and free of any `server-only` import: the punch screen renders a punch
 * time in the browser while the attendance service computes a business date on
 * the server, and the two have to agree on what "today" and "9:30 AM" mean.
 */

/**
 * The zone a date falls back to when nothing better is known.
 *
 * Every cart belongs to a timezone of its own -- a cart in another city rolls
 * over at its own midnight -- so prefer `cart.timezone` wherever it is in hand.
 * This is only the answer for a screen that has no cart to ask.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * The calendar day a moment falls on in a given IANA zone.
 *
 * `en-CA` formats as YYYY-MM-DD, which is exactly what the `business_date`
 * column holds. The database computes this value on insert; this is the
 * read-side counterpart, used to ask for "today".
 */
export function businessDateIn(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
  } catch {
    // An unknown zone in the carts table should not take the page down.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(at);
  }
}

/**
 * A wall-clock time, e.g. "9:30 AM".
 *
 * Pinned to a zone rather than left to the runtime, because the server renders
 * this first: left alone, Vercel would format in UTC and the browser would
 * rewrite it on hydration, so a worker in India would watch a 9:30 punch flash
 * as 4:00.
 */
export function formatLocalTime(
  at: string | Date,
  options?: { timeZone?: string; hour12?: boolean },
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (!date || Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: options?.hour12 ?? true,
      timeZone: options?.timeZone || DEFAULT_TIMEZONE,
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

/** "Friday 12 September 2026" (`full`) or "12 Sep" (`short`). */
export type DateStyle = "full" | "short";

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  short: { day: "numeric", month: "short" },
};

/**
 * Labels a `business_date` (YYYY-MM-DD) for a heading or a table cell.
 *
 * A business date is already a calendar day, not a moment, so it is anchored
 * and formatted in UTC. Reading it in the viewer's zone would slide the label a
 * day either way west of London, and would have the server and the browser
 * disagree on what to print.
 */
export function formatBusinessDate(date: string, style: DateStyle = "full"): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("en-GB", {
    ...DATE_STYLES[style],
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * The day a timestamp fell on, e.g. "Fri 12 Sep".
 *
 * Takes the same zone as `formatLocalTime` on purpose: these two are rendered
 * side by side in a punch list, and a date in one zone beside a time in another
 * is how a 12:30 AM punch ends up labelled with yesterday.
 */
export function formatDayLabel(
  at: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (!date || Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleDateString("en-GB");
  }
}
