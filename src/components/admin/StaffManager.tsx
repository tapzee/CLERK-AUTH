"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";

import { IDLE, saveStaffAction, type ActionState } from "@/app/admin/actions";
import type { AdminCart, AdminStaff } from "@/lib/attendance/admin";

type Editing = { member: AdminStaff | null } | null;

export function StaffManager({
  staff,
  carts,
}: {
  staff: AdminStaff[];
  carts: AdminCart[];
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const cartName = new Map(carts.map((cart) => [cart.id, cart.name]));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Staff</h2>
          <p className="mt-0.5 text-sm text-muted">
            Only enrolled people can punch, and only at their assigned cart.
          </p>
        </div>
        <button
          onClick={() => setEditing({ member: null })}
          disabled={carts.length === 0}
          title={carts.length === 0 ? "Add a cart first." : undefined}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Add staff
        </button>
      </div>

      {editing && (
        <StaffForm
          key={editing.member?.id ?? "new"}
          member={editing.member}
          carts={carts}
          onDone={() => setEditing(null)}
        />
      )}

      {staff.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
          Nobody enrolled yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {member.fullName}
                  {member.role !== "staff" && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
                      {member.role}
                    </span>
                  )}
                  {!member.active && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
                      inactive
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {member.cartId
                    ? (cartName.get(member.cartId) ?? "Unknown cart")
                    : "No cart assigned"}
                  {member.shiftStart && ` · ${member.shiftStart.slice(0, 5)}`}
                  {member.shiftEnd && `–${member.shiftEnd.slice(0, 5)}`}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted/70">
                  {member.clerkUserId}
                </p>
              </div>
              <button
                onClick={() => setEditing({ member })}
                className="rounded-full border border-border px-4 py-1.5 text-sm transition hover:bg-surface-muted"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffForm({
  member,
  carts,
  onDone,
}: {
  member: AdminStaff | null;
  carts: AdminCart[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveStaffAction,
    IDLE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {member && <input type="hidden" name="id" value={member.id} />}

      <Field label="Clerk user id">
        <input
          name="clerkUserId"
          defaultValue={member?.clerkUserId ?? ""}
          required
          placeholder="user_2abc…"
          className={`${INPUT} font-mono`}
        />
        <span className="mt-1 block text-xs text-muted text-pretty">
          The person signs in first, opens /attendance, and the page prints this id
          for them to send you.
        </span>
      </Field>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Full name">
          <input
            name="fullName"
            defaultValue={member?.fullName ?? ""}
            required
            className={INPUT}
          />
        </Field>
        <Field label="Phone (optional)">
          <input name="phone" defaultValue={member?.phone ?? ""} className={INPUT} />
        </Field>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Cart">
          <select name="cartId" defaultValue={member?.cartId ?? ""} className={INPUT}>
            <option value="">— none —</option>
            {carts.map((cart) => (
              <option key={cart.id} value={cart.id}>
                {cart.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role">
          <select name="role" defaultValue={member?.role ?? "staff"} className={INPUT}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Shift start">
          <input
            name="shiftStart"
            type="time"
            defaultValue={member?.shiftStart?.slice(0, 5) ?? ""}
            className={INPUT}
          />
        </Field>
        <Field label="Shift end">
          <input
            name="shiftEnd"
            type="time"
            defaultValue={member?.shiftEnd?.slice(0, 5) ?? ""}
            className={INPUT}
          />
        </Field>
      </div>

      <p className="text-xs text-muted text-pretty">
        Leave the shift blank and nothing is ever counted late — punches are still
        recorded, just without a lateness figure.
      </p>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member?.active ?? true}
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
          {pending ? "Saving…" : member ? "Save changes" : "Enrol"}
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
