import "server-only";

import type { Viewer } from "@/lib/auth/viewer";
import { StorageError } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { assertCoversCart } from "./scope";

/**
 * Carts, and the circle around each one that a punch has to fall inside.
 *
 * A manager sets the pin either by typing coordinates or by pressing "use my
 * location" while standing at the cart, then sets how far from it still counts.
 * Every worker assigned to the cart is held to that circle.
 */

export type CartRecord = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
  active: boolean;
  /** When the coordinates last moved, so a mistyped pin can be traced. */
  pinUpdatedAt: string;
  uniformProfileId: string | null;
  /** Active people assigned here. */
  staffCount: number;
};

const COLUMNS =
  "id, name, latitude, longitude, radius_m, timezone, active, pin_updated_at, " +
  "uniform_profile_id";

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

export async function listCarts(viewer: Viewer): Promise<CartRecord[]> {
  const supabase = supabaseAdmin();

  const [carts, counts] = await Promise.all([
    supabase.from("carts").select(COLUMNS).order("name"),
    // Grouped in Postgres. Counting here would mean reading every staff row in
    // the company to put a number next to a handful of carts.
    supabase.rpc("cart_staff_counts"),
  ]);

  if (carts.error) {
    throw new StorageError(`Could not load carts: ${carts.error.message}`, 502);
  }

  type CountRow = { cart_id: string; staff_count: number };
  const staffPerCart = new Map(
    ((counts.data ?? []) as CountRow[]).map((row) => [row.cart_id, row.staff_count]),
  );

  return ((carts.data ?? []) as unknown as Row[])
    // A manager sees the cart they run; an owner sees all of them.
    .filter((row) => viewer.scope === "all" || row.id === viewer.cartId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusM: row.radius_m,
      timezone: row.timezone,
      active: row.active,
      pinUpdatedAt: row.pin_updated_at,
      uniformProfileId: row.uniform_profile_id,
      staffCount: staffPerCart.get(row.id) ?? 0,
    }));
}

export type CartInput = {
  /** Absent when creating. Only an owner may create -- see `saveCart`. */
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  timezone: string;
  active: boolean;
  uniformProfileId: string | null;
  /** True when the coordinates actually changed, so the pin stamp is refreshed. */
  pinMoved: boolean;
};

export async function saveCart(viewer: Viewer, input: CartInput): Promise<void> {
  if (input.id) {
    assertCoversCart(viewer, input.id);
  } else if (viewer.scope !== "all") {
    // A manager runs a cart; they do not open new ones. Letting them would also
    // hand them an unscoped cart of their own to move staff into.
    throw new StorageError("Only an owner can add a cart.", 403);
  }

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
    ? await supabaseAdmin().from("carts").update(row).eq("id", input.id)
    : await supabaseAdmin().from("carts").insert(row);

  if (error) throw new StorageError(`Could not save the cart: ${error.message}`, 502);
}
