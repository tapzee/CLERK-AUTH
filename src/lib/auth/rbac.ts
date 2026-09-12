/**
 * Role-based access control.
 *
 * Roles are coarse labels; permissions are what the code actually checks. The
 * rest of the app never asks `role === "admin"` — it asks `can(role, "…")` —
 * so adding a capability is one entry in the table below rather than a hunt
 * through every page for role comparisons that have drifted apart.
 *
 * Shared between client and server, so this module must stay free of any
 * `server-only` import or database access.
 */

export const ROLES = ["staff", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Every capability in the system.
 *
 * Named `subject:verb` so the table below reads as a sentence, and grouped by
 * the screen that needs them.
 */
export const PERMISSIONS = [
  // Punching and one's own record.
  "attendance:punch",
  "attendance:read:own",
  "salary:read:own",

  // The management console.
  "console:read",
  "attendance:read:team",
  "attendance:review",

  "staff:read",
  "staff:write",
  /** Changing somebody's role — kept apart from ordinary staff edits. */
  "staff:role:write",
  "salary:write",

  "cart:read",
  "cart:write",
  "uniform:read",
  "uniform:write",

  "payroll:read",
  "payroll:prepare",
  /** Approving or declining a prepared payroll run. */
  "payroll:approve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Punching in, and looking at one's own record.
 *
 * Kept apart from the console permissions below because it describes being a
 * *worker* rather than running the business — a manager is both, but an owner
 * is only ever the second. Without this split, "the owner can do everything a
 * manager can" would also silently mean "the owner clocks in and draws a
 * salary like a shift worker", which is never true here.
 */
const WORKER: readonly Permission[] = [
  "attendance:punch",
  "attendance:read:own",
  "salary:read:own",
];

/**
 * Running one cart day to day: shift times, salaries, the geofence, uniform
 * review, and preparing payroll -- but not approving it, and not handing out
 * roles. Those two are what keep a manager from quietly granting themselves a
 * raise and signing it off.
 */
const RUN_A_CART: readonly Permission[] = [
  "console:read",
  "attendance:read:team",
  "attendance:review",
  "staff:read",
  "staff:write",
  "salary:write",
  "cart:read",
  "cart:write",
  "uniform:read",
  "payroll:read",
  "payroll:prepare",
];

/**
 * A manager runs a cart, and also works it: both `RUN_A_CART` and `WORKER`.
 */
const MANAGER: readonly Permission[] = [...WORKER, ...RUN_A_CART];

/**
 * The owner. Everything a manager can do to run the business, across every
 * cart, plus the two powers withheld from a manager: granting roles, and
 * approving what payroll actually pays out.
 *
 * Deliberately does *not* include `WORKER`: an owner is not tracked as a shift
 * worker by this system, so they never show up marked absent on a day sheet or
 * with a phantom salary line on payroll -- see the `role !== "admin"` filters
 * in `src/lib/manage/attendance.ts` and `src/lib/manage/payroll.ts`, which this
 * permission split exists to justify.
 */
const ADMIN: readonly Permission[] = [
  ...RUN_A_CART,
  "staff:role:write",
  "uniform:write",
  "payroll:approve",
];

const STAFF: readonly Permission[] = WORKER;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  staff: STAFF,
  manager: MANAGER,
  admin: ADMIN,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * How wide a role's reach is over other people's records.
 *
 * Permissions say *what* somebody may do; this says *to whom*. A manager holds
 * `staff:write` but only over their own cart, which every query in
 * `src/lib/manage` narrows by.
 */
export type Scope = "own" | "cart" | "all";

export function scopeOf(role: Role): Scope {
  if (role === "admin") return "all";
  if (role === "manager") return "cart";
  return "own";
}

export const ROLE_LABELS: Record<Role, string> = {
  staff: "Staff",
  manager: "Manager",
  admin: "Owner",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  staff: "Signs in, takes a selfie, and sees their own attendance and pay.",
  manager: "Runs one cart: shifts, salaries, the geofence, and payroll prep.",
  admin: "Sees every cart, grants roles, and approves payroll.",
};

export function parseRole(value: unknown): Role | null {
  return ROLES.includes(value as Role) ? (value as Role) : null;
}
