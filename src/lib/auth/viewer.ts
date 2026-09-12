import "server-only";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { can, type Permission, type Role, type Scope, scopeOf } from "./rbac";

/**
 * Resolving the signed-in session to a staff record.
 *
 * Roles are granted by email address, not by Clerk user id: a manager enrols
 * someone before that person has ever opened the app, and at that moment the
 * Clerk id does not exist yet. The id is bound to the row on first sign-in, and
 * from then on it is the fast path.
 */

export type Viewer = {
  staffId: string;
  fullName: string;
  email: string | null;
  role: Role;
  /** The cart a manager's reach is limited to. Null for an unassigned admin. */
  cartId: string | null;
  clerkUserId: string;
  scope: Scope;
};

/**
 * Signing in and being enrolled are different things, and the two produce very
 * different screens — "sign in" versus "ask your manager to add you" — so the
 * difference is carried in the type rather than collapsed into null.
 */
export type ViewerState =
  | { status: "signed-out" }
  | { status: "not-enrolled"; clerkUserId: string; email: string | null }
  | { status: "enrolled"; viewer: Viewer };

type StaffRow = {
  id: string;
  clerk_user_id: string | null;
  full_name: string;
  email: string | null;
  role: Role;
  cart_id: string | null;
};

const STAFF_COLUMNS = "id, clerk_user_id, full_name, email, role, cart_id";

function toViewer(row: StaffRow, clerkUserId: string): Viewer {
  return {
    staffId: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    cartId: row.cart_id,
    clerkUserId,
    scope: scopeOf(row.role),
  };
}

/**
 * The signed-in user's verified primary email, lowercased.
 *
 * Verification is the whole point of the check: an unverified address could be
 * typed by anyone, and matching a role against one would let a stranger claim a
 * manager's account simply by claiming their address.
 */
async function verifiedEmail(): Promise<string | null> {
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;

  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.trim().toLowerCase();
}

/** The account's display name, for rows this module creates on the fly. */
async function clerkName(fallback: string): Promise<string> {
  const user = await currentUser();
  return user?.fullName?.trim() || fallback;
}

/**
 * Emails that are admins whether or not anybody enrolled them.
 *
 * Granting a role needs the console and reaching the console needs a role, so
 * something has to break the cycle. An allow-list in the environment does it
 * without leaving a "make me admin" button in the UI for the rest of time.
 */
function isBootstrapAdmin(email: string | null): boolean {
  return email !== null && serverEnv.adminEmails.includes(email);
}

/**
 * Records the Clerk id on a row that was enrolled by email alone.
 *
 * Only ever fills a blank. If the row already points at a different Clerk
 * account the address has been reused, and silently re-pointing it would hand
 * the new account the old one's history.
 */
async function bindClerkId(staffId: string, clerkUserId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("staff")
    .update({ clerk_user_id: clerkUserId })
    .eq("id", staffId)
    .is("clerk_user_id", null);

  if (error) {
    console.error("[viewer] could not bind clerk id", error.message);
  }
}

/**
 * Brings a Clerk-matched row up to date with what the environment says.
 *
 * Two things can be stale on a row found by Clerk id:
 *
 *   - No email. Rows created before roles were keyed on the address have none,
 *     and without one they cannot be matched, listed or re-granted by email.
 *   - The wrong role for an owner. The allow-list is meant to be authoritative,
 *     so an address on it that somehow holds a lesser role is put back.
 *
 * Both conditions are decided from the row alone, so the steady state -- an
 * ordinary worker whose email is already recorded -- costs no extra Clerk call
 * and no extra write.
 */
async function reconcile(row: StaffRow): Promise<StaffRow> {
  const needsPromotion = isBootstrapAdmin(row.email) && row.role !== "admin";
  if (row.email && !needsPromotion) return row;

  const patch: Partial<StaffRow> = {};

  if (!row.email) {
    const email = await verifiedEmail();
    // Somebody else may already hold this address; leave the row as it is
    // rather than trip the unique index on every request from then on.
    if (email && !(await findByEmail(email))) patch.email = email;
  }

  const effectiveEmail = patch.email ?? row.email;
  if (isBootstrapAdmin(effectiveEmail) && row.role !== "admin") patch.role = "admin";

  if (Object.keys(patch).length === 0) return row;

  const { data, error } = await supabaseAdmin()
    .from("staff")
    .update(patch)
    .eq("id", row.id)
    .select(STAFF_COLUMNS)
    .single<StaffRow>();

  if (error || !data) {
    console.error("[viewer] could not reconcile staff row", error?.message);
    return row;
  }
  return data;
}

async function findByClerkId(clerkUserId: string): Promise<StaffRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(STAFF_COLUMNS)
    .eq("clerk_user_id", clerkUserId)
    .eq("active", true)
    .maybeSingle<StaffRow>();

  if (error) throw new StorageError(`Could not look up your account: ${error.message}`, 502);
  return data;
}

async function findByEmail(email: string): Promise<StaffRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(STAFF_COLUMNS)
    .ilike("email", email)
    .eq("active", true)
    .maybeSingle<StaffRow>();

  if (error) throw new StorageError(`Could not look up your account: ${error.message}`, 502);
  return data;
}

/** Creates the admin row for a bootstrap address signing in for the first time. */
async function createBootstrapAdmin(
  clerkUserId: string,
  email: string,
): Promise<StaffRow> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .insert({
      clerk_user_id: clerkUserId,
      email,
      full_name: await clerkName("Owner"),
      role: "admin",
      active: true,
    })
    .select(STAFF_COLUMNS)
    .single<StaffRow>();

  if (error || !data) {
    throw new StorageError(`Could not set up the owner account: ${error?.message}`, 502);
  }
  return data;
}

/**
 * Who is asking, and what they are allowed to be.
 *
 * `cache` scopes the result to one request, so a layout, its page and any
 * Server Action in the same render share a single Clerk call and a single
 * database read instead of repeating both.
 */
export const getViewerState = cache(async (): Promise<ViewerState> => {
  const { userId } = await auth();
  if (!userId) return { status: "signed-out" };

  // The common path: an id that was bound on some earlier sign-in.
  const byId = await findByClerkId(userId);
  if (byId) {
    return { status: "enrolled", viewer: toViewer(await reconcile(byId), userId) };
  }

  const email = await verifiedEmail();
  if (!email) return { status: "not-enrolled", clerkUserId: userId, email: null };

  // Enrolled ahead of time by a manager, signing in for the first time.
  const byEmail = await findByEmail(email);
  if (byEmail) {
    if (!byEmail.clerk_user_id) await bindClerkId(byEmail.id, userId);
    return { status: "enrolled", viewer: toViewer(byEmail, userId) };
  }

  if (isBootstrapAdmin(email)) {
    const created = await createBootstrapAdmin(userId, email);
    return { status: "enrolled", viewer: toViewer(created, userId) };
  }

  return { status: "not-enrolled", clerkUserId: userId, email };
});

/**
 * The viewer, or a thrown error.
 *
 * For Server Actions and route handlers, which have no UI to fall back to.
 * Pages read `getViewerState` directly so they can render the difference
 * between "sign in" and "not enrolled yet".
 */
export async function requireViewer(): Promise<Viewer> {
  const state = await getViewerState();

  if (state.status === "signed-out") throw new StorageError("Sign in first.", 401);
  if (state.status === "not-enrolled") {
    throw new StorageError("You are not enrolled. Ask your manager to add you.", 403);
  }
  return state.viewer;
}

/**
 * The gate on every privileged read and write.
 *
 * Server Actions are reachable by direct POST and route handlers by curl, so
 * this runs inside each one rather than only on the page that renders the form.
 */
export async function requirePermission(permission: Permission): Promise<Viewer> {
  const viewer = await requireViewer();

  if (!can(viewer.role, permission)) {
    throw new StorageError("You do not have permission to do that.", 403);
  }
  return viewer;
}

/**
 * The same gate, for a page rather than an action.
 *
 * Pages navigate; actions throw. A layout's `redirect` and its page's data
 * fetch run in parallel, so a page that threw here would log an error on every
 * signed-out request even though the redirect was already winning. `redirect`
 * raises a control-flow exception the framework understands instead.
 */
export async function requirePageAccess(permission: Permission): Promise<Viewer> {
  const state = await getViewerState();

  if (state.status === "signed-out") redirect("/sign-in");
  // Enrolment is explained on the punch screen, which is also where somebody
  // with a role but not this one belongs.
  if (state.status === "not-enrolled") redirect("/punch");
  if (!can(state.viewer.role, permission)) redirect("/punch");

  return state.viewer;
}

/**
 * Where a signed-in person belongs when they land on a public page.
 *
 * An owner or manager wants the console; everybody else wants the camera.
 */
export function homePathFor(viewer: Viewer): string {
  return can(viewer.role, "console:read") ? "/manage" : "/punch";
}

/**
 * Sends whoever is asking to the screen they belong on, and never returns.
 *
 * The landing page and the legacy `/dashboard` and `/admin` paths all funnel
 * through here, so a stale redirect configured in the Clerk dashboard, an old
 * bookmark or a link in an email ends up somewhere real rather than on a 404.
 */
export async function redirectToHome(): Promise<never> {
  const state = await getViewerState();

  if (state.status === "signed-out") redirect("/sign-in");
  // Signed in but nobody has enrolled them: /punch explains what to do.
  if (state.status === "not-enrolled") redirect("/punch");
  redirect(homePathFor(state.viewer));
}

/**
 * Sends an already-signed-in visitor off a signed-out page.
 *
 * Clerk refuses to render `<SignIn/>` to somebody who is already signed in --
 * single-session mode -- and shows a developer notice instead of a screen. This
 * is what keeps the landing page, /sign-in and /sign-up from ever reaching that
 * state, and it puts the rule in one place rather than three.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const state = await getViewerState();

  if (state.status === "enrolled") redirect(homePathFor(state.viewer));
  // Signed in but nobody has enrolled them: /punch explains what to do.
  if (state.status === "not-enrolled") redirect("/punch");
}
