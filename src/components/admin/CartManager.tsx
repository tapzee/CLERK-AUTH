"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";

import { IDLE, saveCartAction, type ActionState } from "@/app/admin/actions";
import type { AdminCart, AdminUniform } from "@/lib/attendance/admin";
import { distanceMetres, formatDistance, MAX_ACCURACY_M } from "@/lib/attendance/geofence";
import { useGeolocation } from "@/lib/hooks/useGeolocation";

type Editing = { cart: AdminCart | null } | null;

export function CartManager({
  carts,
  uniforms,
}: {
  carts: AdminCart[];
  uniforms: AdminUniform[];
}) {
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Carts</h2>
          <p className="mt-0.5 text-sm text-muted">
            One pin per cart. Add each one while standing at it.
          </p>
        </div>
        <button
          onClick={() => setEditing({ cart: null })}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Add cart
        </button>
      </div>

      {editing && (
        <CartForm
          key={editing.cart?.id ?? "new"}
          cart={editing.cart}
          uniforms={uniforms}
          onDone={() => setEditing(null)}
        />
      )}

      {carts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
          No carts yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {carts.map((cart) => (
            <CartRow key={cart.id} cart={cart} onEdit={() => setEditing({ cart })} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CartRow({ cart, onEdit }: { cart: AdminCart; onEdit: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {cart.name}
          {!cart.active && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
              inactive
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted">
          {cart.latitude.toFixed(5)}, {cart.longitude.toFixed(5)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {cart.radiusM}m tolerance · {cart.staffCount} staff · {cart.timezone}
        </p>
      </div>
      <button
        onClick={onEdit}
        className="rounded-full border border-border px-4 py-1.5 text-sm transition hover:bg-surface-muted"
      >
        Edit
      </button>
    </li>
  );
}

function CartForm({
  cart,
  uniforms,
  onDone,
}: {
  cart: AdminCart | null;
  uniforms: AdminUniform[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveCartAction,
    IDLE,
  );

  // Coordinates are component state rather than plain inputs so the "use my
  // location" button can write to them, and so a change can be detected.
  const [latitude, setLatitude] = useState(cart ? String(cart.latitude) : "");
  const [longitude, setLongitude] = useState(cart ? String(cart.longitude) : "");

  const geo = useGeolocation(true);
  const fix = geo.fix;

  const pinMoved =
    !cart || latitude !== String(cart.latitude) || longitude !== String(cart.longitude);

  // Standing at the cart, this says how far the entered pin is from here —
  // the quickest way to catch a coordinate that was typed wrong.
  const parsedLat = Number(latitude);
  const parsedLon = Number(longitude);
  const offset =
    fix && Number.isFinite(parsedLat) && Number.isFinite(parsedLon) && latitude && longitude
      ? distanceMetres(fix, { latitude: parsedLat, longitude: parsedLon })
      : null;

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const coarse = fix !== null && fix.accuracyM > MAX_ACCURACY_M;

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {cart && <input type="hidden" name="id" value={cart.id} />}
      <input type="hidden" name="pinMoved" value={String(pinMoved)} />

      <Field label="Name">
        <input
          name="name"
          defaultValue={cart?.name ?? ""}
          required
          placeholder="Cart 1 — MG Road"
          className={INPUT}
        />
      </Field>

      {/* Location ------------------------------------------------------- */}
      <div className="space-y-2.5 rounded-xl bg-surface-muted p-3.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Latitude">
            <input
              name="latitude"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              required
              inputMode="decimal"
              placeholder="12.97160"
              className={INPUT}
            />
          </Field>
          <Field label="Longitude">
            <input
              name="longitude"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              required
              inputMode="decimal"
              placeholder="77.59460"
              className={INPUT}
            />
          </Field>
        </div>

        <button
          type="button"
          disabled={!fix}
          onClick={() => {
            if (!fix) return;
            setLatitude(fix.latitude.toFixed(6));
            setLongitude(fix.longitude.toFixed(6));
          }}
          className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
        >
          {fix ? "Use my current location" : "Waiting for a GPS fix…"}
        </button>

        <p className="text-xs text-muted text-pretty">
          {coarse ? (
            <span className="text-[color:var(--danger)]">
              This fix is only accurate to ±{Math.round(fix.accuracyM)}m. Punches are
              refused above ±{MAX_ACCURACY_M}m, so set the pin from a phone outdoors,
              not a desktop.
            </span>
          ) : fix ? (
            <>
              Your position is accurate to ±{Math.round(fix.accuracyM)}m.
              {offset !== null && !pinMoved && (
                <> The saved pin is {formatDistance(offset)} from where you stand.</>
              )}
            </>
          ) : (
            (geo.error ?? "Locating…")
          )}
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Tolerance (metres)">
          <input
            name="radiusM"
            type="number"
            min={1}
            defaultValue={cart?.radiusM ?? 150}
            required
            className={INPUT}
          />
        </Field>
        <Field label="Timezone">
          <input
            name="timezone"
            defaultValue={cart?.timezone ?? "Asia/Kolkata"}
            required
            placeholder="Asia/Kolkata"
            className={INPUT}
          />
        </Field>
      </div>

      <p className="text-xs text-muted text-pretty">
        How far from this pin a punch still counts. 100–150m absorbs ordinary phone
        GPS slop without letting someone punch from the next street. Keep it well
        under the distance to your nearest other cart, or a staff member standing at
        one could punch for the other.
      </p>

      <Field label="Uniform">
        <select
          name="uniformProfileId"
          defaultValue={cart?.uniformProfileId ?? ""}
          className={INPUT}
        >
          <option value="">— generic cap, apron and shirt —</option>
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
          className="h-4 w-4"
        />
        Active
      </label>

      {state.error && (
        <p className="rounded-lg bg-[color:var(--danger)]/10 px-3.5 py-2.5 text-sm text-[color:var(--danger)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : cart ? "Save changes" : "Create cart"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-full border border-border px-5 py-2 text-sm transition hover:bg-surface-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-muted";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
