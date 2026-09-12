import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";

import { parseLocation } from "@/lib/geo";
import { checkRateLimit } from "@/lib/rate-limit";
import { StorageError } from "@/lib/storage";
import {
  findStaff,
  getAttendanceStatus,
  recordPunch,
} from "@/lib/attendance/service";
import { parsePunchKind } from "@/lib/attendance/types";
import { runDressCheckBatch } from "@/lib/attendance/dress-checks";

export const runtime = "nodejs";
// Same reasoning as the photos route: the evidence upload plus the storage
// round-trip can outlast the 10s default on a cart's mobile connection.
export const maxDuration = 30;

/** Today's punches and whether the caller is mid-shift. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const staff = await findStaff(userId);
    if (!staff) {
      // Not an error: a signed-in user who has not been enrolled yet. The id is
      // echoed back so it can be pasted straight into the staff table.
      return NextResponse.json({ enrolled: false, clerkUserId: userId });
    }
    return NextResponse.json({
      enrolled: true,
      status: await getAttendanceStatus(staff),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A punch is twice-a-day behaviour; anything near this ceiling is a stuck
  // retry loop or someone probing the geofence.
  const limit = checkRateLimit(`punch:${userId}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a moment." },
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
    const staff = await findStaff(userId);
    if (!staff) {
      return NextResponse.json(
        { error: "You are not enrolled as staff. Ask an admin to add you." },
        { status: 403 },
      );
    }

    const event = await recordPunch({
      clerkUserId: userId,
      staff,
      kind,
      file,
      location: parseLocation(form),
      capturedAt: typeof form.get("capturedAt") === "string"
        ? String(form.get("capturedAt"))
        : null,
      width: numberOrNull(form.get("width")),
      height: numberOrNull(form.get("height")),
    });

    // Fast path for the verdict: runs once this response is on its way, so the
    // staff member is never waiting on a model call. The cron schedule is the
    // durable path — `after` is bounded by maxDuration and is not retried, so
    // anything it drops is picked up within the minute.
    if (event.kind === "in") {
      after(async () => {
        try {
          await runDressCheckBatch();
        } catch (workerError) {
          console.error("[api/attendance] dress check kick failed", workerError);
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
  if (error instanceof StorageError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api/attendance]", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
