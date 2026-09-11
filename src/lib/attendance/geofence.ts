/**
 * Geofencing for punches. Shared between client and server: the browser runs it
 * to show live feedback before the shutter, the server runs it again to decide.
 * The client copy is a convenience — only the server's verdict is recorded.
 */

export type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Great-circle distance in metres.
 *
 * Haversine assumes a sphere, which is wrong by up to ~0.5% — at the few
 * hundred metres a geofence cares about that is well under a metre, and far
 * inside the GPS accuracy radius.
 */
export function distanceMetres(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A fix coarser than this is refused outright.
 *
 * Without it a desktop on Wi-Fi lookup reporting ±2km "passes" a 150m geofence
 * by luck from anywhere in the city — the reported point lands inside the
 * circle while the device could be anywhere in a far larger one. Phones with
 * GPS return single-digit accuracy outdoors, which is what a cart punch should
 * be, so this rejects the guess rather than trusting it.
 */
export const MAX_ACCURACY_M = 100;

export type GeofenceVerdict = {
  ok: boolean;
  distanceM: number | null;
  /** Null when ok; otherwise a message fit to show the staff member. */
  reason: string | null;
};

export function checkGeofence(
  fix: (Point & { accuracyM: number | null }) | null,
  cart: Point & { radiusM: number; name: string },
): GeofenceVerdict {
  if (!fix) {
    return { ok: false, distanceM: null, reason: "No location fix yet." };
  }

  if (fix.accuracyM !== null && fix.accuracyM > MAX_ACCURACY_M) {
    return {
      ok: false,
      distanceM: null,
      reason:
        `Location is only accurate to ±${Math.round(fix.accuracyM)}m, which is too ` +
        `coarse to prove you are at ${cart.name}. Step outside for a GPS fix.`,
    };
  }

  const distanceM = distanceMetres(fix, cart);
  if (distanceM > cart.radiusM) {
    return {
      ok: false,
      distanceM,
      reason: `You are about ${formatDistance(distanceM)} from ${cart.name}.`,
    };
  }

  return { ok: true, distanceM, reason: null };
}

export function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)}m`
    : `${(metres / 1000).toFixed(1)}km`;
}
