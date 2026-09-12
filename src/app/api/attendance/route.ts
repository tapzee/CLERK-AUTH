import { after, NextResponse } from "next/server";

import { getViewerState } from "@/lib/auth/viewer";
import { can } from "@/lib/auth/rbac";
import { parseCaptureMethod, parseLocation } from "@/lib/attendance/location";
import { checkRateLimit } from "@/lib/rate-limit";
import { StorageError } from "@/lib/storage";
import {
  findWorker,
  getAttendanceStatus,
  recordPunch,
  UniformRejected,
} from "@/lib/attendance/service";
import { parsePunchKind } from "@/lib/attendance/types";
import { kickWorkerIfPending, runDressCheckBatch } from "@/lib/attendance/dress-checks";

export const runtime = "nodejs";
/**
 * A check-in now waits on a model call as well as an upload.
 *
 * The uniform check has its own, much shorter deadline -- see
 * `serverEnv.uniformCheckTimeoutMs` -- so this ceiling is the outer bound for
 * upload plus check plus two writes on a cart's mobile connection.
 */
export const maxDuration = 45;

/** Today's punches and whether the caller is mid-shift. */
export async function GET() {
  const state = await getViewerState();
  if (state.status === "signed-out") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (state.status === "not-enrolled") {
    // Not an error: a signed-in person nobody has enrolled yet. The address is
    // echoed back so it can be handed to a manager verbatim.
    return NextResponse.json({ enrolled: false, email: state.email });
  }

  try {
    const worker = await findWorker(state.viewer.staffId);
    if (!worker) return NextResponse.json({ enrolled: false, email: state.viewer.email });

    const status = await getAttendanceStatus(worker);
    kickWorkerIfPending(state.viewer.staffId, status.events);

    return NextResponse.json({ enrolled: true, status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const state = await getViewerState();
  if (state.status !== "enrolled") {
    return NextResponse.json(
      { error: state.status === "signed-out" ? "Sign in first." : "You are not enrolled yet." },
      { status: state.status === "signed-out" ? 401 : 403 },
    );
  }

  const { viewer } = state;
  if (!can(viewer.role, "attendance:punch")) {
    return NextResponse.json({ error: "You cannot record attendance." }, { status: 403 });
  }

  /*
   * Deliberately generous compared with the old limit.
   *
   * A refused uniform check is *meant* to be retried, so somebody fixing their
   * cap and trying again three times in a minute is the system working. This
   * ceiling is only here to stop a stuck client from looping on the model call.
   */
  const limit = checkRateLimit(`punch:${viewer.staffId}`, 15, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const kind = parsePunchKind(form.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "Punch kind must be 'in' or 'out'." }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A photo is required to punch." }, { status: 400 });
  }

  try {
    const worker = await findWorker(viewer.staffId);
    if (!worker) {
      return NextResponse.json(
        { error: "You are not assigned to a cart. Ask your manager." },
        { status: 403 },
      );
    }

    const event = await recordPunch({
      clerkUserId: viewer.clerkUserId,
      email: viewer.email,
      worker,
      kind,
      file,
      location: parseLocation(form),
      capturedAt: typeof form.get("capturedAt") === "string"
        ? String(form.get("capturedAt"))
        : null,
      width: numberOrNull(form.get("width")),
      height: numberOrNull(form.get("height")),
      captureMethod: parseCaptureMethod(form),
    });

    /*
     * Only reached when the inline check could not settle the photo, which
     * leaves a 'queued' row behind. Running the batch worker after the response
     * usually turns that into a verdict within a second or two, so a manager is
     * never asked to review something the model could have answered.
     */
    if (event.dressCheck?.status === "queued") {
      after(async () => {
        try {
          await runDressCheckBatch();
        } catch (workerError) {
          console.error("[api/attendance] catch-up worker failed", workerError);
        }
      });
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function errorResponse(error: unknown) {
  /*
   * A refused uniform is not a generic 422.
   *
   * The punch screen has to tell the worker which item to fix, so the grades
   * travel alongside the message rather than being flattened into prose the
   * client would have to parse back out.
   */
  if (error instanceof UniformRejected) {
    return NextResponse.json(
      {
        error: error.message,
        uniform: { grades: error.grades, score: error.score },
      },
      { status: 422 },
    );
  }

  if (error instanceof StorageError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[api/attendance]", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
