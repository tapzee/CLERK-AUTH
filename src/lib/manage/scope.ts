import "server-only";

import { StorageError } from "@/lib/storage";
import type { Viewer } from "@/lib/auth/viewer";

/**
 * Narrowing what a manager can reach.
 *
 * Permissions answer "may this person edit staff at all"; this answers "which
 * staff". A manager holds `staff:write` but only over their own cart, and a
 * check that stops at the permission would let them edit anyone in the company
 * by posting a different id.
 */

/** True when the viewer's reach covers this cart. */
export function coversCart(viewer: Viewer, cartId: string | null): boolean {
  if (viewer.scope === "all") return true;
  return cartId !== null && cartId === viewer.cartId;
}

/**
 * Refuses a write aimed outside the viewer's cart.
 *
 * Deliberately the same message either way. Saying "that cart exists but is not
 * yours" tells an unauthorised caller more about the business than saying
 * nothing does.
 */
export function assertCoversCart(viewer: Viewer, cartId: string | null): void {
  if (!coversCart(viewer, cartId)) {
    throw new StorageError("That is outside the cart you manage.", 403);
  }
}

/**
 * A manager with no cart assigned.
 *
 * Worth its own check because the failure is otherwise silent: every scoped
 * query would match nothing and the console would look empty rather than
 * misconfigured.
 */
export function hasUsableScope(viewer: Viewer): boolean {
  return viewer.scope === "all" || viewer.cartId !== null;
}
