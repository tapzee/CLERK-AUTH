import "server-only";

import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type { StaffRole } from "./types";

/** Roles allowed into the admin panel. */
const PRIVILEGED: StaffRole[] = ["admin", "manager"];

export type Viewer = {
  staffId: string;
  fullName: string;
  role: StaffRole;
};

export type AdminCart = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
  active: boolean;
  pinUpdatedAt: string;
  uniformProfileId: string | null;
  staffCount: number;
};

export type AdminStaff = {
  id: string;
  clerkUserId: string;
  fullName: string;
  phone: string | null;
  role: StaffRole;
  cartId: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  active: boolean;
};

/**
 * Resolves the caller's role without requiring a cart assignment.
 *
 * `findStaff` insists on a cart because a punch is meaningless without one; an
 * owner who never works a cart still has to reach the admin panel.
 */
export async function findViewer(clerkUserId: string): Promise<Viewer | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select("id, full_name, role")
    .eq("clerk_user_id", clerkUserId)
    .eq("active", true)
    .maybeSingle<{ id: string; full_name: string; role: StaffRole }>();

  if (error) {
    throw new StorageError(`Could not look up your account: ${error.message}`, 502);
  }
  return data ? { staffId: data.id, fullName: data.full_name, role: data.role } : null;
}

/**
 * Gate for every admin read and write.
 *
 * Server Actions are reachable by direct POST, not only through the UI, so this
 * runs inside each one rather than only on the page that renders the form.
 */
export async function requireAdmin(clerkUserId: string): Promise<Viewer> {
  const viewer = await findViewer(clerkUserId);
  if (!viewer || !PRIVILEGED.includes(viewer.role)) {
    throw new StorageError("You do not have access to the admin panel.", 403);
  }
  return viewer;
}

/** True while nobody has been enrolled at all — the bootstrap window. */
export async function staffTableIsEmpty(): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("staff")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new StorageError(`Could not read the staff table: ${error.message}`, 502);
  }
  return (count ?? 0) === 0;
}

/**
 * Makes the caller the first admin, but only while no staff exist at all.
 *
 * Without this the panel is unreachable: managing staff requires a role, and
 * granting a role requires the panel. The emptiness check is what keeps it from
 * being a way in later — once one row exists this can never succeed again.
 */
export async function claimFirstAdmin(
  clerkUserId: string,
  fullName: string,
): Promise<void> {
  if (!(await staffTableIsEmpty())) {
    throw new StorageError("An admin already exists. Ask them to add you.", 409);
  }

  const { error } = await supabaseAdmin()
    .from("staff")
    .insert({ clerk_user_id: clerkUserId, full_name: fullName, role: "admin" });

  if (error) {
    throw new StorageError(`Could not create the first admin: ${error.message}`, 502);
  }
}

const CART_COLUMNS =
  "id, name, latitude, longitude, radius_m, timezone, active, pin_updated_at, " +
  "uniform_profile_id";

export async function listCarts(): Promise<AdminCart[]> {
  const supabase = supabaseAdmin();

  const [carts, staff] = await Promise.all([
    supabase.from("carts").select(CART_COLUMNS).order("name"),
    supabase.from("staff").select("cart_id").eq("active", true),
  ]);

  if (carts.error) {
    throw new StorageError(`Could not load carts: ${carts.error.message}`, 502);
  }

  // Counting in JS rather than a grouped query: a business with a few dozen
  // carts is not worth a view or an RPC.
  const counts = new Map<string, number>();
  for (const row of (staff.data ?? []) as { cart_id: string | null }[]) {
    if (row.cart_id) counts.set(row.cart_id, (counts.get(row.cart_id) ?? 0) + 1);
  }

  type Row = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_m: number;
    timezone: string;
    active: boolean;
    pin_updated_at: string;
    uniform_profile_id: string | null;
  };

  return ((carts.data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusM: row.radius_m,
    timezone: row.timezone,
    active: row.active,
    pinUpdatedAt: row.pin_updated_at,
    uniformProfileId: row.uniform_profile_id,
    staffCount: counts.get(row.id) ?? 0,
  }));
}

export async function listStaff(): Promise<AdminStaff[]> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select("id, clerk_user_id, full_name, phone, role, cart_id, shift_start, shift_end, active")
    .order("full_name");

  if (error) {
    throw new StorageError(`Could not load staff: ${error.message}`, 502);
  }

  type Row = {
    id: string;
    clerk_user_id: string;
    full_name: string;
    phone: string | null;
    role: StaffRole;
    cart_id: string | null;
    shift_start: string | null;
    shift_end: string | null;
    active: boolean;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    clerkUserId: row.clerk_user_id,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    cartId: row.cart_id,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    active: row.active,
  }));
}

export type CartInput = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
  active: boolean;
  uniformProfileId: string | null;
  /** True when the coordinates changed, so the pin timestamp is refreshed. */
  pinMoved: boolean;
};

export async function saveCart(input: CartInput): Promise<void> {
  const supabase = supabaseAdmin();

  const row = {
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    radius_m: input.radiusM,
    timezone: input.timezone,
    active: input.active,
    uniform_profile_id: input.uniformProfileId,
    ...(input.pinMoved ? { pin_updated_at: new Date().toISOString() } : {}),
  };

  const { error } = input.id
    ? await supabase.from("carts").update(row).eq("id", input.id)
    : await supabase.from("carts").insert(row);

  if (error) {
    throw new StorageError(`Could not save the cart: ${error.message}`, 502);
  }
}

export type StaffInput = {
  id?: string;
  clerkUserId: string;
  fullName: string;
  phone: string | null;
  role: StaffRole;
  cartId: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  active: boolean;
};

export async function saveStaff(input: StaffInput): Promise<void> {
  const supabase = supabaseAdmin();

  const row = {
    clerk_user_id: input.clerkUserId,
    full_name: input.fullName,
    phone: input.phone,
    role: input.role,
    cart_id: input.cartId,
    shift_start: input.shiftStart,
    shift_end: input.shiftEnd,
    active: input.active,
  };

  const { error } = input.id
    ? await supabase.from("staff").update(row).eq("id", input.id)
    : await supabase.from("staff").insert(row);

  if (error) {
    // The unique constraint on clerk_user_id is the likely failure, and the
    // raw Postgres text does not say anything useful to an operator.
    throw new StorageError(
      error.code === "23505"
        ? "That Clerk user id is already enrolled."
        : `Could not save the staff member: ${error.message}`,
      error.code === "23505" ? 409 : 502,
    );
  }
}

export type AdminUniform = {
  id: string;
  name: string;
  promptNotes: string | null;
  requiredItems: Record<string, boolean>;
  cartCount: number;
};

/** The items the check reports on. Anything else in the jsonb is ignored. */
export const UNIFORM_ITEMS = ["cap", "apron", "shirt"] as const;

export async function listUniforms(): Promise<AdminUniform[]> {
  const supabase = supabaseAdmin();

  const [profiles, carts] = await Promise.all([
    supabase
      .from("uniform_profiles")
      .select("id, name, prompt_notes, required_items")
      .order("name"),
    supabase.from("carts").select("uniform_profile_id"),
  ]);

  if (profiles.error) {
    throw new StorageError(`Could not load uniforms: ${profiles.error.message}`, 502);
  }

  const counts = new Map<string, number>();
  for (const row of (carts.data ?? []) as { uniform_profile_id: string | null }[]) {
    if (row.uniform_profile_id) {
      counts.set(row.uniform_profile_id, (counts.get(row.uniform_profile_id) ?? 0) + 1);
    }
  }

  type Row = {
    id: string;
    name: string;
    prompt_notes: string | null;
    required_items: Record<string, boolean> | null;
  };

  return ((profiles.data ?? []) as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    promptNotes: row.prompt_notes,
    requiredItems: row.required_items ?? {},
    cartCount: counts.get(row.id) ?? 0,
  }));
}

export type UniformInput = {
  id?: string;
  name: string;
  promptNotes: string | null;
  requiredItems: Record<string, boolean>;
};

export async function saveUniform(input: UniformInput): Promise<void> {
  const supabase = supabaseAdmin();

  const row = {
    name: input.name,
    prompt_notes: input.promptNotes,
    required_items: input.requiredItems,
  };

  const { error } = input.id
    ? await supabase.from("uniform_profiles").update(row).eq("id", input.id)
    : await supabase.from("uniform_profiles").insert(row);

  if (error) {
    throw new StorageError(`Could not save the uniform: ${error.message}`, 502);
  }
}
