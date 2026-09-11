"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  claimFirstAdmin,
  requireAdmin,
  saveCart,
  saveStaff,
  saveUniform,
  UNIFORM_ITEMS,
} from "@/lib/attendance/admin";
import { StorageError } from "@/lib/storage";
import type { StaffRole } from "@/lib/attendance/types";

export type ActionState = { ok: boolean; error: string | null };

export const IDLE: ActionState = { ok: false, error: null };

/**
 * Every action below re-checks the session and the role.
 *
 * Server Actions are reachable by direct POST, not only through the forms that
 * render them, so gating the page that shows the form is not enough.
 */
async function authorize() {
  const { userId } = await auth();
  if (!userId) throw new StorageError("Sign in first.", 401);
  await requireAdmin(userId);
  return userId;
}

function fail(error: unknown): ActionState {
  if (error instanceof StorageError) return { ok: false, error: error.message };
  console.error("[admin action]", error);
  return { ok: false, error: "Something went wrong." };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(form: FormData, key: string): string | null {
  return text(form, key) || null;
}

function number(form: FormData, key: string): number {
  const parsed = Number(text(form, key));
  if (!Number.isFinite(parsed)) {
    throw new StorageError(`"${key}" must be a number.`, 400);
  }
  return parsed;
}

/** Rejects a zone the attendance trigger would later choke on. */
function timezone(form: FormData): string {
  const zone = text(form, "timezone") || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    throw new StorageError(`"${zone}" is not a valid timezone name.`, 400);
  }
  return zone;
}

function role(form: FormData): StaffRole {
  const value = text(form, "role");
  if (value !== "staff" && value !== "manager" && value !== "admin") {
    throw new StorageError("Role must be staff, manager, or admin.", 400);
  }
  return value;
}

export async function saveCartAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await authorize();

    const name = text(form, "name");
    if (!name) throw new StorageError("The cart needs a name.", 400);

    const latitude = number(form, "latitude");
    const longitude = number(form, "longitude");
    if (latitude < -90 || latitude > 90) {
      throw new StorageError("Latitude must be between -90 and 90.", 400);
    }
    if (longitude < -180 || longitude > 180) {
      throw new StorageError("Longitude must be between -180 and 180.", 400);
    }

    const radiusM = Math.round(number(form, "radiusM"));
    if (radiusM <= 0) throw new StorageError("Radius must be a positive number.", 400);

    await saveCart({
      id: optionalText(form, "id") ?? undefined,
      name,
      latitude,
      longitude,
      radiusM,
      timezone: timezone(form),
      active: form.get("active") === "on",
      uniformProfileId: optionalText(form, "uniformProfileId"),
      // The client sets this only when the coordinate inputs actually changed,
      // so editing a cart's name does not make a stale pin look fresh.
      pinMoved: form.get("pinMoved") === "true",
    });

    revalidatePath("/admin");
    return { ok: true, error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function saveStaffAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await authorize();

    const clerkUserId = text(form, "clerkUserId");
    if (!clerkUserId.startsWith("user_")) {
      throw new StorageError("A Clerk user id looks like \"user_2abc…\".", 400);
    }

    const fullName = text(form, "fullName");
    if (!fullName) throw new StorageError("The staff member needs a name.", 400);

    await saveStaff({
      id: optionalText(form, "id") ?? undefined,
      clerkUserId,
      fullName,
      phone: optionalText(form, "phone"),
      role: role(form),
      cartId: optionalText(form, "cartId"),
      shiftStart: optionalText(form, "shiftStart"),
      shiftEnd: optionalText(form, "shiftEnd"),
      active: form.get("active") === "on",
    });

    revalidatePath("/admin");
    revalidatePath("/attendance");
    return { ok: true, error: null };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Bootstrap only. `claimFirstAdmin` refuses once any staff row exists, so this
 * deliberately does not call `authorize` — there is nobody to be authorized by
 * yet.
 */
// Takes no previous state: there is nothing to merge, and useActionState is
// happy to call a function that ignores the argument it passes.
export async function claimAdminAction(): Promise<ActionState> {
  try {
    const { userId } = await auth();
    if (!userId) throw new StorageError("Sign in first.", 401);

    const user = await currentUser();
    const name =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Administrator";

    await claimFirstAdmin(userId, name);

    revalidatePath("/admin");
    revalidatePath("/attendance");
    return { ok: true, error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function saveUniformAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await authorize();

    const name = text(form, "name");
    if (!name) throw new StorageError("The uniform needs a name.", 400);

    // Checkbox semantics: an unticked box sends nothing, so absence means the
    // item is reported but never fails a check.
    const requiredItems = Object.fromEntries(
      UNIFORM_ITEMS.map((item) => [item, form.get(`required.${item}`) === "on"]),
    );

    await saveUniform({
      id: optionalText(form, "id") ?? undefined,
      name,
      promptNotes: optionalText(form, "promptNotes"),
      requiredItems,
    });

    revalidatePath("/admin");
    return { ok: true, error: null };
  } catch (error) {
    return fail(error);
  }
}
