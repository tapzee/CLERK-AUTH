import "server-only";

import { can, type Role } from "@/lib/auth/rbac";
import type { Viewer } from "@/lib/auth/viewer";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { assertCoversCart } from "./scope";

/**
 * Enrolling people, and setting the terms they work under.
 *
 * Enrolment is by email address: the person may not have an account yet, and
 * the Clerk id is bound to the row the first time they sign in -- see
 * `src/lib/auth/viewer.ts`.
 */

export type StaffRecord = {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: Role;
  cartId: string | null;
  active: boolean;
  /** Null until the person has signed in at least once. */
  clerkUserId: string | null;

  // Shift, as wall-clock time in the cart's timezone.
  shiftStart: string | null;
  shiftEnd: string | null;
  /** Minutes past `shiftStart` that still count as on time. */
  graceMinutes: number;

  // Pay.
  monthlySalary: number | null;
  workingDaysPerMonth: number;
  lateDeduction: number;
};

const COLUMNS =
  "id, email, full_name, phone, role, cart_id, active, clerk_user_id, " +
  "shift_start, shift_end, grace_minutes, " +
  "monthly_salary, working_days_per_month, late_deduction";

type Row = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  role: Role;
  cart_id: string | null;
  active: boolean;
  clerk_user_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number | null;
  monthly_salary: string | number | null;
  working_days_per_month: number | null;
  late_deduction: string | number | null;
};

/** Postgres `numeric` arrives as a string, to preserve exactness in transit. */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecord(row: Row): StaffRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    cartId: row.cart_id,
    active: row.active,
    clerkUserId: row.clerk_user_id,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    graceMinutes: row.grace_minutes ?? 0,
    monthlySalary: toNumber(row.monthly_salary),
    workingDaysPerMonth: row.working_days_per_month ?? 26,
    lateDeduction: toNumber(row.late_deduction) ?? 0,
  };
}

/** Everyone the viewer is allowed to see: their own cart, or all of them. */
export async function listStaff(viewer: Viewer): Promise<StaffRecord[]> {
  const base = supabaseAdmin().from("staff").select(COLUMNS).order("full_name");

  // A manager with no cart sees nobody rather than everybody: an id that
  // matches nothing is safer than an unfiltered query.
  const scoped =
    viewer.scope === "cart"
      ? base.eq("cart_id", viewer.cartId ?? "00000000-0000-0000-0000-000000000000")
      : base;

  const { data, error } = await scoped.returns<Row[]>();
  if (error) throw new StorageError(`Could not load staff: ${error.message}`, 502);

  return (data ?? []).map(toRecord);
}

/**
 * The subset of the roster that attendance and payroll actually track.
 *
 * An owner is not a shift worker in this system -- see the `WORKER` /
 * `RUN_A_CART` split in `src/lib/auth/rbac.ts` -- so without this filter they
 * would show up on every day sheet marked absent, and on every payroll run
 * with no salary set, purely for having a row in the same table as everyone
 * else. A manager remains included: they work a shift as well as running one.
 */
export function trackableStaff(staff: StaffRecord[]): StaffRecord[] {
  return staff.filter((member) => member.active && member.role !== "admin");
}

/** One person, if the viewer may see them. */
export async function findStaffRecord(
  viewer: Viewer,
  staffId: string,
): Promise<StaffRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(COLUMNS)
    .eq("id", staffId)
    .maybeSingle<Row>();

  if (error) throw new StorageError(`Could not load that person: ${error.message}`, 502);
  if (!data) return null;

  assertCoversCart(viewer, data.cart_id);
  return toRecord(data);
}

export type StaffInput = {
  /** Absent when enrolling somebody new. */
  id?: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  cartId: string | null;
  active: boolean;

  shiftStart: string | null;
  shiftEnd: string | null;
  graceMinutes: number;

  monthlySalary: number | null;
  workingDaysPerMonth: number;
  lateDeduction: number;
};

/**
 * The row a viewer is actually permitted to write.
 *
 * Two escalation paths close here, and both would otherwise be reachable by
 * posting a hand-made form:
 *
 *   - Role. Only `staff:role:write` may set one, so a manager's save keeps
 *     whatever role the row already had, and a manager's new enrolment is
 *     always plain staff.
 *   - Cart. A manager may only write within their own cart, both the row they
 *     are editing and the cart they are moving it to.
 */
function resolveRole(
  viewer: Viewer,
  input: StaffInput,
  existing: StaffRecord | null,
): Role {
  if (!can(viewer.role, "staff:role:write")) return existing?.role ?? "staff";

  /*
   * Nobody changes their own role, not even an owner.
   *
   * Demoting yourself out of the console is a one-way door: the permission you
   * would need to undo it is the one you just gave away. With a single owner it
   * locks the business out of its own payroll.
   */
  if (existing && existing.id === viewer.staffId && input.role !== existing.role) {
    throw new StorageError(
      "You cannot change your own role. Ask another owner to do it.",
      409,
    );
  }

  return input.role;
}

export async function saveStaff(viewer: Viewer, input: StaffInput): Promise<void> {
  const existing = input.id ? await findStaffRecord(viewer, input.id) : null;
  if (input.id && !existing) throw new StorageError("That person no longer exists.", 404);

  // Where they are going, and (for an edit) where they are now.
  assertCoversCart(viewer, input.cartId);

  /*
   * An owner's record is off limits to a manager even inside their own cart.
   * Without this, a manager sharing a cart with an owner could deactivate them
   * and walk into an unattended console.
   */
  if (existing && existing.role === "admin" && !can(viewer.role, "staff:role:write")) {
    throw new StorageError("You cannot edit an owner's record.", 403);
  }

  const resolvedRole = resolveRole(viewer, input, existing);
  const isManager = resolvedRole === "manager";

  const row = {
    email: input.email.trim().toLowerCase(),
    full_name: input.fullName,
    phone: input.phone,
    role: resolvedRole,
    cart_id: input.cartId,
    active: input.active,
    shift_start: isManager ? null : input.shiftStart,
    shift_end: isManager ? null : input.shiftEnd,
    grace_minutes: isManager ? 0 : input.graceMinutes,
    monthly_salary: input.monthlySalary,
    working_days_per_month: input.workingDaysPerMonth,
    late_deduction: isManager ? 0 : input.lateDeduction,
  };

  const { error } = input.id
    ? await supabaseAdmin().from("staff").update(row).eq("id", input.id)
    : await supabaseAdmin().from("staff").insert(row);

  if (error) {
    // The unique index on lower(email) is the likely failure, and the raw
    // Postgres text says nothing useful to whoever is filling in the form.
    const duplicate = error.code === "23505";
    throw new StorageError(
      duplicate
        ? "Somebody is already enrolled with that email address."
        : `Could not save: ${error.message}`,
      duplicate ? 409 : 502,
    );
  }
}
