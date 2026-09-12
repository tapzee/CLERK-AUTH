"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/viewer";
import { REFERENCE_KEYS, type ItemKey } from "@/lib/uniform/items";
import { StorageError } from "@/lib/storage";
import type { ActionState } from "@/lib/manage/action-state";
import * as form from "@/lib/manage/form";
import { reviewPunch } from "@/lib/manage/attendance";
import { saveCart } from "@/lib/manage/carts";
import { decidePayroll, markPaid, preparePayroll } from "@/lib/manage/payroll";
import { saveStaff } from "@/lib/manage/staff";
import {
  deleteReferenceImage,
  saveReferenceImage,
  saveUniform,
  updateReferenceDescription,
} from "@/lib/manage/uniforms";

/**
 * Every write the console can make.
 *
 * Each one opens with `requirePermission`, which re-reads the session and the
 * role. Server Actions are reachable by direct POST, not only through the forms
 * that render them, so gating the page that shows the form is not enough.
 */

/** Turns any thrown error into something the form can display. */
function fail(error: unknown): ActionState {
  if (error instanceof StorageError) return { ok: false, error: error.message };

  console.error("[manage action]", error);
  return { ok: false, error: "Something went wrong. Try again." };
}

function done(message?: string): ActionState {
  return { ok: true, error: null, message };
}

/** Pages that go stale after almost any console write. */
function revalidateConsole(): void {
  revalidatePath("/manage", "layout");
  revalidatePath("/punch");
  revalidatePath("/me");
}

// Staff -----------------------------------------------------------------------

/**
 * Enrolment and every term of employment, in one write.
 *
 * The role travels on this form too. `saveStaff` decides whether the viewer is
 * allowed to set it -- a manager's posted role is discarded rather than
 * refused, so editing somebody's shift never fails just because the form
 * carried a field they cannot change.
 */
export async function saveStaffAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("staff:write");

    await saveStaff(viewer, {
      id: form.optionalText(data, "id") ?? undefined,
      email: form.email(data, "email"),
      fullName: form.requiredText(data, "fullName", "Name"),
      phone: form.optionalText(data, "phone"),
      role: form.role(data),
      cartId: form.optionalText(data, "cartId"),
      active: form.checkbox(data, "active"),

      shiftStart: form.optionalTime(data, "shiftStart"),
      shiftEnd: form.optionalTime(data, "shiftEnd"),
      graceMinutes: form.integerInRange(data, "graceMinutes", "Grace", 0, 240),

      monthlySalary: form.optionalNumber(data, "monthlySalary", "Monthly salary"),
      workingDaysPerMonth: form.integerInRange(
        data,
        "workingDaysPerMonth",
        "Working days",
        1,
        31,
      ),
      lateDeduction: form.money(data, "lateDeduction", "Late deduction"),
    });

    revalidateConsole();
    return done("Saved.");
  } catch (error) {
    return fail(error);
  }
}

// Carts -----------------------------------------------------------------------

export async function saveCartAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("cart:write");

    const latitude = form.number(data, "latitude", "Latitude");
    const longitude = form.number(data, "longitude", "Longitude");
    if (latitude < -90 || latitude > 90) {
      throw new StorageError("Latitude must be between -90 and 90.", 400);
    }
    if (longitude < -180 || longitude > 180) {
      throw new StorageError("Longitude must be between -180 and 180.", 400);
    }

    await saveCart(viewer, {
      id: form.optionalText(data, "id") ?? undefined,
      name: form.requiredText(data, "name", "Cart name"),
      latitude,
      longitude,
      radiusM: form.integerInRange(data, "radiusM", "Radius", 10, 5000),
      timezone: form.timezone(data),
      active: form.checkbox(data, "active"),
      uniformProfileId: form.optionalText(data, "uniformProfileId"),
      // The client sets this only when the coordinate inputs actually changed,
      // so editing a cart's name does not make a stale pin look fresh.
      pinMoved: data.get("pinMoved") === "true",
    });

    revalidateConsole();
    return done("Cart saved.");
  } catch (error) {
    return fail(error);
  }
}

// Uniforms --------------------------------------------------------------------

export async function saveUniformAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    await requirePermission("uniform:write");

    await saveUniform({
      id: form.optionalText(data, "id") ?? undefined,
      name: form.requiredText(data, "name", "Uniform name"),
      promptNotes: form.optionalText(data, "promptNotes"),
      passScore: form.integerInRange(data, "passScore", "Pass mark", 0, 100),
    });

    revalidateConsole();
    return done("Uniform saved.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Reference photos only exist for the four garments. "Overall turnout" is
 * scored too but has nothing to photograph, so it is rejected here.
 */
function referenceKind(data: FormData): ItemKey {
  const value = form.text(data, "kind");
  if (!(REFERENCE_KEYS as readonly string[]).includes(value)) {
    throw new StorageError("That uniform item does not take a reference photo.", 400);
  }
  return value as ItemKey;
}

export async function uploadReferenceAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    await requirePermission("uniform:write");

    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new StorageError("Pick an image to upload.", 400);
    }

    await saveReferenceImage({
      uniformProfileId: form.requiredText(data, "uniformProfileId", "Uniform"),
      kind: referenceKind(data),
      file,
    });

    revalidateConsole();
    return done("Reference photo saved.");
  } catch (error) {
    return fail(error);
  }
}

export async function deleteReferenceAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    await requirePermission("uniform:write");

    await deleteReferenceImage(
      form.requiredText(data, "uniformProfileId", "Uniform"),
      referenceKind(data),
    );

    revalidateConsole();
    return done("Reference photo removed.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Corrects the wording a description was auto-generated with.
 *
 * Every kind except the logo is matched by this text rather than by resending
 * its photo on every check -- see the module comment on
 * `describeReferenceImage` -- so a wrong colour or cut here is worth being able
 * to fix directly, without re-uploading the photo just to trigger a rewrite.
 */
export async function updateReferenceDescriptionAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    await requirePermission("uniform:write");

    await updateReferenceDescription(
      form.requiredText(data, "uniformProfileId", "Uniform"),
      referenceKind(data),
      form.requiredText(data, "description", "Description"),
    );

    revalidateConsole();
    return done("Description saved.");
  } catch (error) {
    return fail(error);
  }
}

// Attendance review -----------------------------------------------------------

export async function reviewPunchAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("attendance:review");

    const decision = form.text(data, "decision");
    if (decision !== "cleared" && decision !== "flagged") {
      throw new StorageError("Pick whether the uniform was acceptable.", 400);
    }

    await reviewPunch(
      viewer,
      form.requiredText(data, "eventId", "Punch"),
      decision,
      form.optionalText(data, "note"),
    );

    revalidateConsole();
    return done(decision === "cleared" ? "Cleared." : "Marked as a breach.");
  } catch (error) {
    return fail(error);
  }
}

// Payroll ---------------------------------------------------------------------

export async function preparePayrollAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("payroll:prepare");

    const staffIds = data.getAll("staffId").filter((id): id is string => typeof id === "string");
    if (staffIds.length === 0) {
      throw new StorageError("Pick at least one person.", 400);
    }

    const { prepared, skipped } = await preparePayroll(
      viewer,
      form.isoDate(data, "periodMonth", "Month"),
      staffIds,
    );

    revalidateConsole();
    return done(
      skipped > 0
        ? `${prepared} sent for approval, ${skipped} skipped (already approved, or no salary set).`
        : `${prepared} sent for approval.`,
    );
  } catch (error) {
    return fail(error);
  }
}

export async function decidePayrollAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("payroll:approve");

    const decision = form.text(data, "decision");
    if (decision !== "approved" && decision !== "declined") {
      throw new StorageError("Pick approve or decline.", 400);
    }

    await decidePayroll(
      viewer,
      form.requiredText(data, "runId", "Payroll run"),
      decision,
      form.optionalText(data, "note"),
    );

    revalidateConsole();
    return done(decision === "approved" ? "Approved." : "Declined.");
  } catch (error) {
    return fail(error);
  }
}

export async function markPaidAction(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  try {
    const viewer = await requirePermission("payroll:approve");
    await markPaid(viewer, form.requiredText(data, "runId", "Payroll run"));

    revalidateConsole();
    return done("Marked as paid.");
  } catch (error) {
    return fail(error);
  }
}
