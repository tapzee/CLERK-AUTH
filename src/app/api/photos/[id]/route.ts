import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { deletePhoto } from "@/lib/photos";
import { StorageError } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/photos/[id]">) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Scoped to the caller: another user's id simply reads as "not found".
    await deletePhoto(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/photos/:id]", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
