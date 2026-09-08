import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { parseCaptureMethod, parseLocation } from "@/lib/geo";
import { listPhotos, storePhoto } from "@/lib/photos";
import { StorageError } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ photos: await listPhotos(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(`upload:${userId}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Give it a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo field in the request." }, { status: 400 });
  }

  try {
    const photo = await storePhoto({
      userId,
      file,
      width: numberOrNull(form.get("width")),
      height: numberOrNull(form.get("height")),
      capturedAt: typeof form.get("capturedAt") === "string" ? String(form.get("capturedAt")) : null,
      location: parseLocation(form),
      captureMethod: parseCaptureMethod(form),
    });
    return NextResponse.json({ photo }, { status: 201 });
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
  console.error("[api/photos]", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
