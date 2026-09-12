import "server-only";

import type { Viewer } from "@/lib/auth/viewer";
import { providerFor, StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { monthEnd } from "@/lib/payroll/calculate";
import { businessDateIn, DEFAULT_TIMEZONE } from "@/lib/time";
import type { ReviewStatus, UniformVerdict } from "@/lib/attendance/types";

import { listStaff, trackableStaff, type StaffRecord } from "./staff";

/**
 * Reading attendance as a manager rather than as the person who punched.
 *
 * Everything here is scoped through `listStaff`, which already narrows to the
 * viewer's cart. Going through it rather than querying `attendance_events`
 * directly means the scope rule is written once and cannot be forgotten by a
 * later query.
 */

/**
 * The business date the console should default to.
 *
 * Business dates are per cart, because a cart in another city rolls over at its
 * own midnight. A manager has exactly one cart so the answer is unambiguous; an
 * owner spanning zones gets their own cart's day, or the first active cart's,
 * which is the least surprising of the available wrong answers. They can always
 * pick a date explicitly.
 */
export async function todayForViewer(viewer: Viewer): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("carts")
    .select("id, timezone")
    .eq("active", true)
    .order("name")
    .returns<{ id: string; timezone: string }[]>();

  const carts = data ?? [];
  const mine = viewer.cartId ? carts.find((cart) => cart.id === viewer.cartId) : undefined;

  return businessDateIn(mine?.timezone ?? carts[0]?.timezone ?? DEFAULT_TIMEZONE);
}

/** One person's day: when they arrived, when they left, and how it went. */
export type DayRow = {
  staff: StaffRecord;
  checkIn: PunchSummary | null;
  checkOut: PunchSummary | null;
  /** Check-ins refused by the uniform check before they became a punch. */
  rejectedAttempts: number;
};

export type PunchSummary = {
  eventId: string;
  at: string;
  lateByMinutes: number | null;
  earlyByMinutes: number | null;
  isLate: boolean;
  distanceM: number | null;
  reviewStatus: ReviewStatus;
  dressCheck: UniformVerdict | null;
};

type EventRow = {
  id: string;
  staff_id: string;
  kind: "in" | "out";
  happened_at: string;
  business_date: string;
  distance_m: number | null;
  late_by_minutes: number | null;
  early_by_minutes: number | null;
  is_late: boolean;
  review_status: ReviewStatus;
  photo_id: string | null;
};

const EVENT_COLUMNS =
  "id, staff_id, kind, happened_at, business_date, distance_m, " +
  "late_by_minutes, early_by_minutes, is_late, review_status, photo_id";

function toSummary(row: EventRow, dressCheck: UniformVerdict | null): PunchSummary {
  return {
    eventId: row.id,
    at: row.happened_at,
    lateByMinutes: row.late_by_minutes,
    earlyByMinutes: row.early_by_minutes,
    isLate: row.is_late,
    distanceM: row.distance_m,
    reviewStatus: row.review_status,
    dressCheck,
  };
}

/** Verdicts for a set of events, in one query rather than one per row. */
async function verdictsFor(eventIds: string[]): Promise<Map<string, UniformVerdict>> {
  if (eventIds.length === 0) return new Map();

  const { data } = await supabaseAdmin()
    .from("dress_checks")
    .select("attendance_event_id, status, verdict, items, reason, score")
    .in("attendance_event_id", eventIds);

  type Row = { attendance_event_id: string } & UniformVerdict;
  return new Map(
    ((data ?? []) as Row[]).map(({ attendance_event_id, ...verdict }) => [
      attendance_event_id,
      verdict,
    ]),
  );
}

/**
 * Everyone's day, whether or not they turned up.
 *
 * Absences are the point: a sheet built from punches alone would silently omit
 * the person who never arrived, which is exactly who a manager is looking for.
 * So the roster leads and the punches are joined onto it.
 */
export async function getDaySheet(
  viewer: Viewer,
  businessDate: string,
): Promise<DayRow[]> {
  const staff = trackableStaff(await listStaff(viewer));
  if (staff.length === 0) return [];

  const staffIds = staff.map((member) => member.id);
  const supabase = supabaseAdmin();

  const [events, attempts] = await Promise.all([
    supabase
      .from("attendance_events")
      .select(EVENT_COLUMNS)
      .in("staff_id", staffIds)
      .eq("business_date", businessDate)
      .order("happened_at", { ascending: true })
      .returns<EventRow[]>(),
    supabase
      .from("uniform_attempts")
      .select("staff_id")
      .in("staff_id", staffIds)
      .eq("business_date", businessDate),
  ]);

  if (events.error) {
    throw new StorageError(`Could not load the day: ${events.error.message}`, 502);
  }

  const rows = events.data ?? [];
  const verdicts = await verdictsFor(rows.filter((row) => row.kind === "in").map((row) => row.id));

  const rejects = new Map<string, number>();
  for (const row of (attempts.data ?? []) as { staff_id: string }[]) {
    rejects.set(row.staff_id, (rejects.get(row.staff_id) ?? 0) + 1);
  }

  return staff.map((member) => {
    const mine = rows.filter((row) => row.staff_id === member.id);
    // First arrival and last departure. Somebody who steps away for a break
    // punches more than once, and the day is bounded by the outer pair.
    const checkIn = mine.find((row) => row.kind === "in") ?? null;
    const checkOut = [...mine].reverse().find((row) => row.kind === "out") ?? null;

    return {
      staff: member,
      checkIn: checkIn ? toSummary(checkIn, verdicts.get(checkIn.id) ?? null) : null,
      checkOut: checkOut ? toSummary(checkOut, null) : null,
      rejectedAttempts: rejects.get(member.id) ?? 0,
    };
  });
}

/** A punch waiting on a person, with the photo that has to be looked at. */
export type ReviewItem = {
  eventId: string;
  staffName: string;
  at: string;
  businessDate: string;
  dressCheck: UniformVerdict | null;
  photoUrl: string | null;
};

/**
 * The queue of punches the model could not settle.
 *
 * These are already recorded and already counted for pay -- flagging is not a
 * penalty, it is a request for a second opinion on a photo.
 */
export async function getReviewQueue(viewer: Viewer, limit = 40): Promise<ReviewItem[]> {
  const staff = await listStaff(viewer);
  if (staff.length === 0) return [];

  const nameById = new Map(staff.map((member) => [member.id, member.fullName]));

  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .select(EVENT_COLUMNS)
    .in("staff_id", [...nameById.keys()])
    .eq("review_status", "pending")
    .order("happened_at", { ascending: false })
    .limit(limit)
    .returns<EventRow[]>();

  if (error) {
    throw new StorageError(`Could not load the review queue: ${error.message}`, 502);
  }

  const rows = data ?? [];
  const [verdicts, photos] = await Promise.all([
    verdictsFor(rows.map((row) => row.id)),
    signPhotos(rows.map((row) => row.photo_id).filter((id): id is string => !!id)),
  ]);

  return rows.map((row) => ({
    eventId: row.id,
    staffName: nameById.get(row.staff_id) ?? "Unknown",
    at: row.happened_at,
    businessDate: row.business_date,
    dressCheck: verdicts.get(row.id) ?? null,
    photoUrl: row.photo_id ? (photos.get(row.photo_id) ?? null) : null,
  }));
}

/** Signed URLs for evidence photos, batched by storage provider. */
async function signPhotos(photoIds: string[]): Promise<Map<string, string | null>> {
  const urls = new Map<string, string | null>();
  if (photoIds.length === 0) return urls;

  const { data } = await supabaseAdmin()
    .from("photos")
    .select("id, provider, storage_path")
    .in("id", photoIds);

  type Row = { id: string; provider: string; storage_path: string };
  const rows = (data ?? []) as Row[];

  const byProvider = new Map<string, Row[]>();
  for (const row of rows) {
    byProvider.set(row.provider, [...(byProvider.get(row.provider) ?? []), row]);
  }

  await Promise.all(
    [...byProvider].map(async ([provider, group]) => {
      const signed = await providerFor(provider).signedUrls(group.map((row) => row.storage_path));
      for (const row of group) urls.set(row.id, signed.get(row.storage_path) ?? null);
    }),
  );

  return urls;
}

/**
 * Settles one flagged punch.
 *
 * "cleared" means the person was in uniform after all; "flagged" means the
 * manager agrees they were not. Neither changes the attendance record -- the
 * shift happened either way -- so this is a note on conduct, not on pay.
 */
export async function reviewPunch(
  viewer: Viewer,
  eventId: string,
  decision: Extract<ReviewStatus, "cleared" | "flagged">,
  note: string | null,
): Promise<void> {
  const allowed = new Set((await listStaff(viewer)).map((member) => member.id));

  const { data: event, error: readError } = await supabaseAdmin()
    .from("attendance_events")
    .select("id, staff_id")
    .eq("id", eventId)
    .maybeSingle<{ id: string; staff_id: string }>();

  if (readError) throw new StorageError(`Could not load that punch: ${readError.message}`, 502);
  if (!event || !allowed.has(event.staff_id)) {
    throw new StorageError("That punch is outside the cart you manage.", 403);
  }

  const { error } = await supabaseAdmin()
    .from("attendance_events")
    .update({
      review_status: decision,
      review_note: note,
      reviewed_by: viewer.staffId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) throw new StorageError(`Could not save the review: ${error.message}`, 502);
}

/** Days present and days late for one month, per person. */
export type MonthlyAttendance = {
  staffId: string;
  daysPresent: number;
  daysLate: number;
};

/**
 * The month's attendance, reduced to the two numbers payroll needs.
 *
 * Lateness is decided by the *first* check-in of each day -- somebody who
 * arrives on time, steps out at noon and punches back in late has not turned up
 * late -- which the `monthly_attendance` function does with DISTINCT ON.
 */
export async function getMonthlyAttendance(
  staffIds: string[],
  periodMonth: string,
): Promise<Map<string, MonthlyAttendance>> {
  const summary = new Map<string, MonthlyAttendance>(
    staffIds.map((id) => [id, { staffId: id, daysPresent: 0, daysLate: 0 }]),
  );
  if (staffIds.length === 0) return summary;

  // Grouped in Postgres rather than here. Reading every punch of the month back
  // into the application would make this cost grow with the size of the
  // company instead of with the number of people being paid.
  const { data, error } = await supabaseAdmin().rpc("monthly_attendance", {
    p_staff_ids: staffIds,
    p_from: periodMonth,
    p_to: monthEnd(periodMonth),
  });

  if (error) {
    throw new StorageError(`Could not load the month: ${error.message}`, 502);
  }

  type AggregateRow = { staff_id: string; days_present: number; days_late: number };
  for (const row of (data ?? []) as AggregateRow[]) {
    const entry = summary.get(row.staff_id);
    if (!entry) continue;

    entry.daysPresent = row.days_present;
    entry.daysLate = row.days_late;
  }

  return summary;
}

/** One worker's own punches for a month, newest first. */
export async function getWorkerMonth(
  staffId: string,
  periodMonth: string,
): Promise<PunchSummary[]> {
  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .select(EVENT_COLUMNS)
    .eq("staff_id", staffId)
    .gte("business_date", periodMonth)
    .lte("business_date", monthEnd(periodMonth))
    .order("happened_at", { ascending: false })
    .returns<EventRow[]>();

  if (error) {
    throw new StorageError(`Could not load your attendance: ${error.message}`, 502);
  }

  const rows = data ?? [];
  const verdicts = await verdictsFor(rows.map((row) => row.id));

  return rows.map((row) => toSummary(row, verdicts.get(row.id) ?? null));
}
