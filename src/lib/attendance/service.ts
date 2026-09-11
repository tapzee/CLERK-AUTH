import "server-only";

import { deletePhoto, storePhoto } from "@/lib/photos";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LocationInput } from "@/lib/geo";

import { enqueueDressCheck } from "./dress-checks";
import { checkGeofence } from "./geofence";
import type {
  AttendanceEvent,
  DressCheck,
  AttendanceStatus,
  PunchKind,
  Staff,
  StaffRole,
} from "./types";

/**
 * Shape of the staff row joined to its cart. Supabase returns the embedded
 * relation as an object when the FK is many-to-one.
 */
type StaffRow = {
  id: string;
  full_name: string;
  role: StaffRole;
  shift_start: string | null;
  shift_end: string | null;
  carts: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_m: number;
    timezone: string;
  } | null;
};

type EventRow = {
  id: string;
  kind: PunchKind;
  happened_at: string;
  business_date: string;
  distance_m: number | null;
  geofence_ok: boolean;
  late_by_minutes: number | null;
  early_by_minutes: number | null;
};

const STAFF_SELECT =
  "id, full_name, role, shift_start, shift_end, " +
  "carts ( id, name, latitude, longitude, radius_m, timezone )";

/**
 * The calendar day a moment falls on in a given IANA zone.
 *
 * `en-CA` formats as YYYY-MM-DD, which is what the `business_date` column
 * holds. The database computes this value on insert; this is the read-side
 * counterpart used to ask for "today".
 */
export function businessDateIn(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
  } catch {
    // An unknown zone in the carts table should not take the page down.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(at);
  }
}

function toStaff(row: StaffRow): Staff {
  if (!row.carts) {
    throw new StorageError(
      "You are enrolled but not assigned to a cart. Ask an admin to set one.",
      409,
    );
  }
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    cart: {
      id: row.carts.id,
      name: row.carts.name,
      latitude: row.carts.latitude,
      longitude: row.carts.longitude,
      radiusM: row.carts.radius_m,
      timezone: row.carts.timezone,
    },
  };
}

function toEvent(row: EventRow, dressCheck: DressCheck | null = null): AttendanceEvent {
  return {
    id: row.id,
    kind: row.kind,
    happenedAt: row.happened_at,
    businessDate: row.business_date,
    distanceM: row.distance_m,
    geofenceOk: row.geofence_ok,
    lateByMinutes: row.late_by_minutes,
    earlyByMinutes: row.early_by_minutes,
    dressCheck,
  };
}

/**
 * Resolves the signed-in Clerk user to a staff record.
 *
 * Returns null rather than throwing when there is no row: a signed-in user who
 * has not been enrolled is an ordinary state, and the punch screen explains it.
 */
export async function findStaff(clerkUserId: string): Promise<Staff | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(STAFF_SELECT)
    .eq("clerk_user_id", clerkUserId)
    .eq("active", true)
    .maybeSingle<StaffRow>();

  if (error) {
    throw new StorageError(`Could not look up staff record: ${error.message}`, 502);
  }
  return data ? toStaff(data) : null;
}

/** Today's punches for one staff member, in the cart's local day. */
async function todaysEvents(staff: Staff): Promise<AttendanceEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .select(
      "id, kind, happened_at, business_date, distance_m, geofence_ok, " +
        "late_by_minutes, early_by_minutes",
    )
    .eq("staff_id", staff.id)
    .eq("business_date", businessDateIn(staff.cart.timezone))
    .order("happened_at", { ascending: true })
    .returns<EventRow[]>();

  if (error) {
    throw new StorageError(`Could not load attendance: ${error.message}`, 502);
  }

  const events = data ?? [];
  if (events.length === 0) return [];

  // Verdicts are fetched alongside rather than per event, so the punch screen
  // costs two queries regardless of how many times someone punched today.
  const { data: checks } = await supabaseAdmin()
    .from("dress_checks")
    .select("attendance_event_id, status, verdict, items, reason")
    .in("attendance_event_id", events.map((event) => event.id));

  type CheckRow = { attendance_event_id: string } & DressCheck;
  const byEvent = new Map(
    ((checks ?? []) as CheckRow[]).map(({ attendance_event_id, ...check }) => [
      attendance_event_id,
      check,
    ]),
  );

  return events.map((event) => toEvent(event, byEvent.get(event.id) ?? null));
}

export async function getAttendanceStatus(staff: Staff): Promise<AttendanceStatus> {
  const events = await todaysEvents(staff);
  // A shift is open when the most recent punch of the day was an 'in'. This
  // allows more than one in/out pair per day, which is how breaks look.
  const onShift = events.at(-1)?.kind === "in";

  return { staff, events, onShift, nextKind: onShift ? "out" : "in" };
}

type PunchInput = {
  clerkUserId: string;
  staff: Staff;
  kind: PunchKind;
  file: File;
  /**
   * A 384px copy of the same frame, for the uniform check.
   *
   * Sent by the browser rather than derived here: Gemini bills a flat rate for
   * an image whose sides are both 384px or under and tiles anything larger, so
   * the evidence photo would cost about four times as much to judge. Resizing
   * server-side would mean an image library in the bundle for no benefit, since
   * the browser already has the frame in a canvas.
   */
  modelFile: File | null;
  location: LocationInput;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
};

/**
 * Records one punch.
 *
 * Order matters: the session rule and the geofence are both checked *before*
 * the photo is uploaded, so a rejected punch costs no storage write and no
 * model call.
 *
 * The uniform verdict is deliberately not awaited. Attendance is the record
 * that matters and it must not depend on a third-party API being up or fast —
 * the check is queued, and `after()` on the route kicks the worker so the
 * verdict usually lands a second or two later.
 */
export async function recordPunch({
  clerkUserId,
  staff,
  kind,
  file,
  modelFile,
  location,
  capturedAt,
  width,
  height,
}: PunchInput): Promise<AttendanceEvent> {
  const status = await getAttendanceStatus(staff);

  if (kind !== status.nextKind) {
    throw new StorageError(
      kind === "in"
        ? "You are already checked in. Check out first."
        : "You are not checked in yet.",
      409,
    );
  }

  const verdict = checkGeofence(
    location.latitude === null || location.longitude === null
      ? null
      : {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyM: location.accuracyM,
        },
    staff.cart,
  );

  if (!verdict.ok) {
    throw new StorageError(
      verdict.reason ?? "You are not close enough to the cart to punch.",
      422,
    );
  }

  // Evidence photo first: it is the thing a manager looks at when a verdict is
  // disputed, so an event without one is not worth recording.
  const photo = await storePhoto({
    userId: clerkUserId,
    file,
    width,
    height,
    capturedAt,
    location,
    captureMethod: "manual",
    purpose: "attendance",
  });

  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .insert({
      staff_id: staff.id,
      cart_id: staff.cart.id,
      kind,
      happened_at: capturedAt ?? new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy_m: location.accuracyM,
      distance_m: verdict.distanceM,
      geofence_ok: true,
      photo_id: photo.id,
      // business_date, late_by_minutes and early_by_minutes are filled by the
      // attendance_derived trigger, which has the cart's timezone to hand.
    })
    .select(
      "id, kind, happened_at, business_date, distance_m, geofence_ok, " +
        "late_by_minutes, early_by_minutes",
    )
    .single<EventRow>();

  if (error || !data) {
    // Don't leave the evidence photo behind for an event that does not exist.
    await deletePhoto(clerkUserId, photo.id).catch(() => {});
    throw new StorageError(`Could not record the punch: ${error?.message}`, 502);
  }

  // Only check-ins. Re-verifying a uniform at the end of a shift costs a model
  // call and tells the business nothing it did not learn at check-in, so this
  // halves the call volume for free.
  if (kind === "in") {
    // Stored second and best-effort: a punch is already recorded by this point
    // and must not be undone because the smaller copy failed to upload.
    let modelPhotoId: string | null = null;
    if (modelFile) {
      try {
        const modelPhoto = await storePhoto({
          userId: clerkUserId,
          file: modelFile,
          capturedAt,
          location,
          purpose: "attendance",
        });
        modelPhotoId = modelPhoto.id;
      } catch (uploadError) {
        console.error("[attendance] model copy upload failed", uploadError);
      }
    }

    await enqueueDressCheck({
      attendanceEventId: data.id,
      photoId: photo.id,
      modelPhotoId,
    });
  }

  return toEvent(data);
}
