import "server-only";

import {
  deletePhoto,
  storeVerifiedPhoto,
  verifyImageUpload,
  type PhotoRow,
  type VerifiedImage,
} from "@/lib/photos";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadUniformForCart } from "@/lib/uniform/profile";
import type { CaptureMethod, LocationInput } from "@/lib/geo";

import { checkGeofence } from "./geofence";
import { judgeSelfie, rejectionMessage, type UniformResult } from "./uniform-check";
import type {
  AttendanceEvent,
  AttendanceStatus,
  PunchKind,
  ReviewStatus,
  UniformVerdict,
  Worker,
} from "./types";
import type { Role } from "@/lib/auth/rbac";

/**
 * Recording attendance.
 *
 * The shape of a check-in here is deliberate: the uniform is judged *before*
 * anything is written, so a worker who is out of uniform is turned away with a
 * reason rather than clocked in and quietly marked down. Everything that can
 * refuse the punch runs before the first write, in ascending order of cost.
 */

const EVENT_COLUMNS =
  "id, kind, happened_at, business_date, distance_m, geofence_ok, " +
  "late_by_minutes, early_by_minutes, is_late, grace_minutes, review_status";

const WORKER_SELECT =
  "id, full_name, role, shift_start, shift_end, grace_minutes, " +
  "carts ( id, name, latitude, longitude, radius_m, timezone )";

type WorkerRow = {
  id: string;
  full_name: string;
  role: Role;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number | null;
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
  is_late: boolean;
  grace_minutes: number | null;
  review_status: ReviewStatus;
};

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

function toWorker(row: WorkerRow): Worker {
  if (!row.carts) {
    throw new StorageError(
      "You are enrolled but not assigned to a cart yet. Ask your manager to set one.",
      409,
    );
  }
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    graceMinutes: row.grace_minutes ?? 0,
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

function toEvent(row: EventRow, dressCheck: UniformVerdict | null = null): AttendanceEvent {
  return {
    id: row.id,
    kind: row.kind,
    happenedAt: row.happened_at,
    businessDate: row.business_date,
    distanceM: row.distance_m,
    geofenceOk: row.geofence_ok,
    lateByMinutes: row.late_by_minutes,
    earlyByMinutes: row.early_by_minutes,
    isLate: row.is_late,
    graceMinutes: row.grace_minutes,
    reviewStatus: row.review_status,
    dressCheck,
  };
}

/**
 * Resolves a staff row to the worker record a punch needs.
 *
 * Separate from `getViewerState`, which answers "what may this person do":
 * this one answers "where do they work and when is their shift", and insists on
 * a cart because a punch without one has nothing to be near.
 */
export async function findWorker(staffId: string): Promise<Worker | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(WORKER_SELECT)
    .eq("id", staffId)
    .eq("active", true)
    .maybeSingle<WorkerRow>();

  if (error) {
    throw new StorageError(`Could not look up your staff record: ${error.message}`, 502);
  }
  return data ? toWorker(data) : null;
}

/** Today's punches for one worker, in the cart's local day. */
async function todaysEvents(worker: Worker): Promise<AttendanceEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .select(EVENT_COLUMNS)
    .eq("staff_id", worker.id)
    .eq("business_date", businessDateIn(worker.cart.timezone))
    .order("happened_at", { ascending: true })
    .returns<EventRow[]>();

  if (error) {
    throw new StorageError(`Could not load attendance: ${error.message}`, 502);
  }

  const events = data ?? [];
  if (events.length === 0) return [];

  // Verdicts are fetched alongside rather than per event, so the punch screen
  // costs two queries regardless of how many times somebody punched today.
  const { data: checks } = await supabaseAdmin()
    .from("dress_checks")
    .select("attendance_event_id, status, verdict, items, reason, score")
    .in("attendance_event_id", events.map((event) => event.id));

  type CheckRow = { attendance_event_id: string } & UniformVerdict;
  const byEvent = new Map(
    ((checks ?? []) as CheckRow[]).map(({ attendance_event_id, ...check }) => [
      attendance_event_id,
      check,
    ]),
  );

  return events.map((event) => toEvent(event, byEvent.get(event.id) ?? null));
}

export async function getAttendanceStatus(worker: Worker): Promise<AttendanceStatus> {
  const events = await todaysEvents(worker);
  // A shift is open when the most recent punch of the day was an 'in'. This
  // allows more than one in/out pair per day, which is how breaks look.
  const onShift = events.at(-1)?.kind === "in";

  return { worker, events, onShift, nextKind: onShift ? "out" : "in" };
}

/**
 * Thrown when the uniform check refuses a check-in.
 *
 * Carries the per-item grades as well as the message so the punch screen can
 * show which item failed rather than only a sentence.
 */
export class UniformRejected extends StorageError {
  constructor(
    message: string,
    readonly grades: Record<string, string> | null,
    readonly score: number | null,
  ) {
    super(message, 422);
    this.name = "UniformRejected";
  }
}

type PunchInput = {
  clerkUserId: string;
  worker: Worker;
  kind: PunchKind;
  file: File;
  location: LocationInput;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  /** 'manual' for the button, 'blink' when the on-device detector fired it. */
  captureMethod: CaptureMethod;
};

/**
 * Records one punch.
 *
 * Order matters, and it is cheapest-first: the session rule and the geofence
 * are pure arithmetic, the uniform check costs a model call, and the photo
 * upload costs storage. A punch refused at step one pays for nothing.
 */
export async function recordPunch(input: PunchInput): Promise<AttendanceEvent> {
  const { worker, kind, location } = input;

  const status = await getAttendanceStatus(worker);
  if (kind !== status.nextKind) {
    throw new StorageError(
      kind === "in"
        ? "You are already checked in. Check out first."
        : "You are not checked in yet.",
      409,
    );
  }

  const fence = checkGeofence(
    location.latitude === null || location.longitude === null
      ? null
      : {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyM: location.accuracyM,
        },
    worker.cart,
  );

  if (!fence.ok) {
    throw new StorageError(
      fence.reason ?? "You are not close enough to the cart to punch.",
      422,
    );
  }

  // Read once, use twice: the model gets these bytes, and so does storage.
  const image = await verifyImageUpload(input.file);

  // Check-outs are not judged. Re-verifying a uniform at the end of a shift
  // costs a model call and tells the business nothing it did not learn at
  // check-in, so this halves the call volume for free.
  const uniform =
    kind === "in"
      ? await judgeSelfie(image, await loadUniformForCart(worker.cart.id))
      : null;

  if (uniform?.outcome === "fail") {
    // No attendance event, but the attempt is still worth a record: a manager
    // needs to see that somebody tried four times without a cap on.
    await recordRejectedAttempt(input, image, uniform);
    throw new UniformRejected(
      rejectionMessage(uniform),
      uniform.grades,
      uniform.scored?.score ?? null,
    );
  }

  const photo = await storeVerifiedPhoto(image, {
    userId: input.clerkUserId,
    width: input.width,
    height: input.height,
    capturedAt: input.capturedAt,
    location,
    captureMethod: input.captureMethod,
    purpose: "attendance",
  });

  const event = await insertEvent(input, photo, fence.distanceM, uniform);
  if (uniform) await saveVerdict(event.id, photo.id, uniform);

  return event;
}

/** Anything a person still has to look at is flagged as it is written. */
function reviewStatusFor(uniform: UniformResult | null): ReviewStatus {
  if (!uniform) return "none";
  return uniform.outcome === "pass" ? "none" : "pending";
}

async function insertEvent(
  input: PunchInput,
  photo: PhotoRow,
  distanceM: number | null,
  uniform: UniformResult | null,
): Promise<AttendanceEvent> {
  const { data, error } = await supabaseAdmin()
    .from("attendance_events")
    .insert({
      staff_id: input.worker.id,
      cart_id: input.worker.cart.id,
      kind: input.kind,
      happened_at: input.capturedAt ?? new Date().toISOString(),
      recorded_at: new Date().toISOString(),
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_m: input.location.accuracyM,
      distance_m: distanceM,
      geofence_ok: true,
      photo_id: photo.id,
      review_status: reviewStatusFor(uniform),
      // business_date, late_by_minutes, early_by_minutes, is_late and
      // grace_minutes are filled by the attendance_derived trigger, which has
      // the cart's timezone and the worker's allowance to hand.
    })
    .select(EVENT_COLUMNS)
    .single<EventRow>();

  if (error || !data) {
    // Don't leave the evidence photo behind for an event that does not exist.
    await deletePhoto(input.clerkUserId, photo.id).catch(() => {});
    throw new StorageError(`Could not record the punch: ${error?.message}`, 502);
  }

  return toEvent(data);
}

/**
 * Writes the verdict that was reached inline.
 *
 * A verdict the model never gave is stored as 'queued' rather than 'failed', so
 * the batch worker picks the photo up a minute later and settles it without
 * anybody having to ask again.
 */
async function saveVerdict(
  eventId: string,
  photoId: string,
  uniform: UniformResult,
): Promise<void> {
  const settled = uniform.outcome !== "unavailable";

  const { error } = await supabaseAdmin().from("dress_checks").insert({
    attendance_event_id: eventId,
    photo_id: photoId,
    // One photo serves both roles. Gemini 3.x prices an image by media
    // resolution rather than by its pixel size, so a second, smaller copy would
    // save upload bandwidth and not one token.
    model_photo_id: photoId,

    status: settled ? "done" : "queued",
    verdict: settled ? uniform.outcome : null,
    score: uniform.scored?.score ?? null,
    score_best: uniform.scored?.best ?? null,
    score_worst: uniform.scored?.worst ?? null,
    items: uniform.grades ? { ...uniform.grades, at_cart: uniform.atCart } : null,
    reason: uniform.outcome === "pass" ? null : uniform.why,
    model: uniform.model,
    input_tokens: uniform.inputTokens,
    output_tokens: uniform.outputTokens,
    error: uniform.error,
    completed_at: settled ? new Date().toISOString() : null,
  });

  if (error) {
    // The punch is already recorded and is the thing that matters; a verdict
    // that could not be filed is worth a log line, not a failed check-in.
    console.error("[attendance] could not save the uniform verdict", error.message);
  }
}

/**
 * Files a refused check-in.
 *
 * The photo is kept because "show me the shot you rejected" is the first thing
 * a worker asks when they disagree, and without it a manager has nothing to
 * settle the argument with.
 */
async function recordRejectedAttempt(
  input: PunchInput,
  image: VerifiedImage,
  uniform: UniformResult,
): Promise<void> {
  try {
    const photo = await storeVerifiedPhoto(image, {
      userId: input.clerkUserId,
      width: input.width,
      height: input.height,
      capturedAt: input.capturedAt,
      location: input.location,
      captureMethod: input.captureMethod,
      purpose: "attendance",
    });

    await supabaseAdmin().from("uniform_attempts").insert({
      staff_id: input.worker.id,
      cart_id: input.worker.cart.id,
      business_date: businessDateIn(input.worker.cart.timezone),
      photo_id: photo.id,
      verdict: "fail",
      score: uniform.scored?.score ?? null,
      items: uniform.grades ? { ...uniform.grades, at_cart: uniform.atCart } : null,
      reason: uniform.why,
      model: uniform.model,
      input_tokens: uniform.inputTokens,
      output_tokens: uniform.outputTokens,
    });
  } catch (error) {
    // Never let bookkeeping swallow the rejection the worker needs to see.
    console.error("[attendance] could not file the rejected attempt", error);
  }
}
