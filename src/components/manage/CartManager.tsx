"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  Store,
  MapPin,
  Navigation,
  Crosshair,
  Users,
  Shirt,
  Plus,
  Edit3,
  AlertTriangle,
  Radio,
} from "lucide-react";

import { saveCartAction } from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { CartRecord } from "@/lib/manage/carts";
import type { UniformRecord } from "@/lib/manage/uniforms";
import { MAX_ACCURACY_M } from "@/lib/attendance/geofence";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

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
        title="Food Carts &amp; Geofences"
        description="Punches are verified against the precise GPS radius defined for each location."
        action={
          canCreate ? (
            <button onClick={() => setEditing({ cart: null })} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              <span>Add cart</span>
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
          icon={<Store className="h-5 w-5" />}
          title="No carts configured yet"
          body={
            canCreate
              ? "Add your first cart, then stand at it and click “Use my location” to drop the pin."
              : "An owner must add a cart before you can manage one."
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {carts.map((cart) => (
            <li key={cart.id}>
              <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 transition-all hover:border-border">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground text-sm sm:text-base">
                        {cart.name}
                      </p>
                      {!cart.active && <Pill tone="neutral">Inactive</Pill>}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-surface-muted px-2 py-0.5 rounded-md">
                        <MapPin className="h-3 w-3 text-accent" />
                        {cart.latitude.toFixed(5)}, {cart.longitude.toFixed(5)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Radio className="h-3 w-3 text-accent" />
                        {cart.radiusM}m radius
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3 text-accent" />
                        {cart.staffCount} {cart.staffCount === 1 ? "staff" : "staff"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Shirt className="h-3 w-3 text-accent" />
                        {cart.uniformProfileId
                          ? (uniformName.get(cart.uniformProfileId) ?? "Unknown uniform")
                          : "Default uniform"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setEditing({ cart })}
                  className="btn btn-ghost px-3 py-1.5 text-xs sm:text-sm"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
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

  const [pinMoved, setPinMoved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState<{ accuracyM: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  function dropPin() {
    if (!navigator.geolocation) {
      setGeoError("This device cannot report GPS location. Type coordinates manually.");
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
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
            ? "Location permission was denied. Allow it or enter coordinates manually."
            : "Could not obtain accurate GPS fix. Try outdoors or enter coordinates manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const coarse = fix !== null && fix.accuracyM > MAX_ACCURACY_M;

  return (
    <Card className="border-accent/30 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
        <p className="font-bold text-base text-foreground">
          {cart ? `Edit Cart · ${cart.name}` : "Configure New Food Cart"}
        </p>
      </div>

      <form action={action} className="space-y-5">
        {cart && <input type="hidden" name="id" value={cart.id} />}
        <input type="hidden" name="pinMoved" value={String(pinMoved)} />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Cart Location Name">
            <input
              name="name"
              defaultValue={cart?.name ?? ""}
              required
              placeholder="e.g. Connaught Place Cart #1"
              className="input"
            />
          </Field>
          <Field label="Timezone" hint="Shift lateness and dates are calculated in this zone.">
            <input
              name="timezone"
              defaultValue={cart?.timezone ?? "Asia/Kolkata"}
              required
              className="input font-mono"
            />
          </Field>
        </div>

        {/* Location Pin */}
        <fieldset className="space-y-3.5 border-t border-border/70 pt-4">
          <legend className="sr-only">Geofence Coordinates</legend>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-accent" />
              <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                GPS Pin &amp; Geofence Radius
              </p>
            </div>
            <button
              type="button"
              onClick={dropPin}
              disabled={locating}
              className="btn btn-ghost text-xs"
            >
              <Navigation className={`h-3.5 w-3.5 text-accent ${locating ? "animate-spin" : ""}`} />
              <span>{locating ? "Acquiring GPS…" : "Use my location"}</span>
            </button>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
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
            <Field label="Radius (metres)" hint="150m suits street food carts.">
              <input
                name="radiusM"
                type="number"
                min={10}
                max={5000}
                defaultValue={cart?.radiusM ?? 150}
                required
                className="input font-mono"
              />
            </Field>
          </div>

          {geoError && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{geoError}</span>
            </div>
          )}

          {coarse && (
            <p className="text-xs text-warning text-pretty">
              ⚠️ GPS fix is accurate to ±{Math.round(fix!.accuracyM)}m (too coarse for strict geofence).
              Confirm coordinates outdoors.
            </p>
          )}

          <p className="text-xs text-muted text-pretty">
            Staff assigned to this cart must stand within this radius to punch.
            {cart && ` Pin last updated: ${new Date(cart.pinUpdatedAt).toLocaleDateString()}.`}
          </p>
        </fieldset>

        <Field label="Uniform Profile" hint="Vision AI compares selfies against this uniform definition.">
          <select
            name="uniformProfileId"
            defaultValue={cart?.uniformProfileId ?? ""}
            className="input"
          >
            <option value="">— Standard default (cap, apron, shirt) —</option>
            {uniforms.map((uniform) => (
              <option key={uniform.id} value={uniform.id}>
                {uniform.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            name="active"
            defaultChecked={cart?.active ?? true}
            className="h-4 w-4 accent-accent rounded"
          />
          <span>Active cart — inactive carts reject attendance check-ins.</span>
        </label>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5 pt-2">
          <SubmitButton>{cart ? "Save Changes" : "Create Cart"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
