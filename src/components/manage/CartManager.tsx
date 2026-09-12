"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveCartAction } from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { CartRecord } from "@/lib/manage/carts";
import type { UniformRecord } from "@/lib/manage/uniforms";
import { MAX_ACCURACY_M } from "@/lib/attendance/geofence";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

/**
 * Carts and their geofence.
 *
 * The pin can be typed or captured by standing at the cart and pressing "use my
 * location", which is how a manager who has never seen a coordinate in their
 * life sets one correctly.
 */

type Editing = { cart: CartRecord | null } | null;

export function CartManager({
  carts,
  uniforms,
  canCreate,
}: {
  carts: CartRecord[];
  uniforms: UniformRecord[];
  canCreate: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const uniformName = new Map(uniforms.map((uniform) => [uniform.id, uniform.name]));

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Carts"
        description="A punch only counts inside the circle you set here."
        action={
          canCreate ? (
            <button onClick={() => setEditing({ cart: null })} className="btn btn-primary">
              Add cart
            </button>
          ) : undefined
        }
      />

      {editing && (
        <CartForm
          key={editing.cart?.id ?? "new"}
          cart={editing.cart}
          uniforms={uniforms}
          onDone={() => setEditing(null)}
        />
      )}

      {carts.length === 0 ? (
        <EmptyState
          title="No carts yet"
          body={
            canCreate
              ? "Add your first cart, then stand at it and press “use my location” to drop the pin."
              : "An owner has to add a cart before you can manage one."
          }
        />
      ) : (
        <ul className="space-y-2">
          {carts.map((cart) => (
            <li key={cart.id}>
              <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {cart.name}
                    {!cart.active && <Pill tone="neutral">Inactive</Pill>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-mono">
                      {cart.latitude.toFixed(5)}, {cart.longitude.toFixed(5)}
                    </span>
                    <span>{cart.radiusM}m radius</span>
                    <span>
                      {cart.staffCount} {cart.staffCount === 1 ? "person" : "people"}
                    </span>
                    <span>
                      {cart.uniformProfileId
                        ? (uniformName.get(cart.uniformProfileId) ?? "Unknown uniform")
                        : "Default uniform"}
                    </span>
                  </p>
                </div>
                <button onClick={() => setEditing({ cart })} className="btn btn-ghost">
                  Edit
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartForm({
  cart,
  uniforms,
  onDone,
}: {
  cart: CartRecord | null;
  uniforms: UniformRecord[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveCartAction, IDLE);

  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  /*
   * Whether the coordinates actually changed.
   *
   * The pin's timestamp is an audit trail for "when did this cart move", so
   * renaming a cart must not refresh it. Tracked here rather than compared on
   * the server, where the old value would have to be re-read first.
   */
  const [pinMoved, setPinMoved] = useState(false);

  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState<{ accuracyM: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  /*
   * Drops the pin where the manager is standing.
   *
   * A single request rather than the watcher the punch screen uses: a cart is
   * placed once, and holding a position watch open for a form that is about to
   * close would keep the GPS radio busy for no reason.
   */
  function dropPin() {
    if (!navigator.geolocation) {
      setGeoError("This device cannot report its location. Type the coordinates instead.");
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Written straight to the inputs rather than held in state, so the
        // manager can still correct them by hand afterwards.
        if (latitudeRef.current) {
          latitudeRef.current.value = position.coords.latitude.toFixed(6);
        }
        if (longitudeRef.current) {
          longitudeRef.current.value = position.coords.longitude.toFixed(6);
        }

        setFix({ accuracyM: position.coords.accuracy });
        setPinMoved(true);
        setLocating(false);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow it, or type the coordinates in."
            : "Could not get a location fix. Try again outdoors, or type the coordinates in.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const coarse = fix !== null && fix.accuracyM > MAX_ACCURACY_M;

  return (
    <Card className="p-4">
      <form action={action} className="space-y-5">
        {cart && <input type="hidden" name="id" value={cart.id} />}
        <input type="hidden" name="pinMoved" value={String(pinMoved)} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cart name">
            <input name="name" defaultValue={cart?.name ?? ""} required className="input" />
          </Field>
          <Field label="Timezone" hint="The day and lateness are worked out in this zone.">
            <input
              name="timezone"
              defaultValue={cart?.timezone ?? "Asia/Kolkata"}
              required
              className="input"
            />
          </Field>
        </div>

        {/* The pin ---------------------------------------------------------- */}
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">Location</legend>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Where the cart stands</p>
            <button type="button" onClick={dropPin} disabled={locating} className="btn btn-ghost">
              {locating ? "Locating…" : "Use my location"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Latitude">
              <input
                ref={latitudeRef}
                name="latitude"
                type="number"
                step="any"
                defaultValue={cart?.latitude ?? ""}
                required
                onChange={() => setPinMoved(true)}
                className="input font-mono"
              />
            </Field>
            <Field label="Longitude">
              <input
                ref={longitudeRef}
                name="longitude"
                type="number"
                step="any"
                defaultValue={cart?.longitude ?? ""}
                required
                onChange={() => setPinMoved(true)}
                className="input font-mono"
              />
            </Field>
            <Field label="Radius (metres)" hint="150m suits a street cart.">
              <input
                name="radiusM"
                type="number"
                min={10}
                max={5000}
                defaultValue={cart?.radiusM ?? 150}
                required
                className="input"
              />
            </Field>
          </div>

          {geoError && <p className="text-xs text-danger text-pretty">{geoError}</p>}

          {coarse && (
            <p className="text-xs text-warning text-pretty">
              That fix is only accurate to ±{Math.round(fix!.accuracyM)}m, which is
              coarser than a punch is allowed to be. Drop the pin from a phone,
              outdoors, or type the coordinates in.
            </p>
          )}

          <p className="text-xs text-muted text-pretty">
            Stand at the cart and press “use my location”, or type the coordinates.
            Everyone assigned to this cart has to be inside this circle to punch.
            {cart && ` Pin last moved ${new Date(cart.pinUpdatedAt).toLocaleDateString()}.`}
          </p>
        </fieldset>

        <Field label="Uniform" hint="What the check compares this cart's selfies against.">
          <select
            name="uniformProfileId"
            defaultValue={cart?.uniformProfileId ?? ""}
            className="input"
          >
            <option value="">— default (cap, apron, shirt) —</option>
            {uniforms.map((uniform) => (
              <option key={uniform.id} value={uniform.id}>
                {uniform.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={cart?.active ?? true}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Active
        </label>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5">
          <SubmitButton>{cart ? "Save changes" : "Add cart"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
