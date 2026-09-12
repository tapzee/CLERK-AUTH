"use client";

import { useActionState, useEffect, useState } from "react";

import { saveStaffAction } from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/rbac";
import type { CartRecord } from "@/lib/manage/carts";
import type { StaffRecord } from "@/lib/manage/staff";
import { formatMoney } from "@/lib/payroll/calculate";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

/**
 * The roster, and the terms each person works under.
 *
 * One form covers identity, shift, grace and pay because they are set together
 * when somebody is hired and rarely touched apart afterwards -- splitting them
 * across three screens would mean three round trips to enrol one worker.
 */

/** `null` means the form is closed; `{ member: null }` means "enrol somebody new". */
type Editing = { member: StaffRecord | null } | null;

export function StaffManager({
  staff,
  carts,
  canSetRoles,
}: {
  staff: StaffRecord[];
  carts: CartRecord[];
  canSetRoles: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const cartName = new Map(carts.map((cart) => [cart.id, cart.name]));

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Staff"
        description="Enrol by email — the role is attached to the address they sign in with."
        action={
          <button
            onClick={() => setEditing({ member: null })}
            disabled={carts.length === 0}
            title={carts.length === 0 ? "Add a cart first." : undefined}
            className="btn btn-primary"
          >
            Add staff
          </button>
        }
      />

      {editing && (
        <StaffForm
          // Remounts the form when the subject changes, so defaultValues reload.
          key={editing.member?.id ?? "new"}
          member={editing.member}
          carts={carts}
          canSetRoles={canSetRoles}
          onDone={() => setEditing(null)}
        />
      )}

      {staff.length === 0 ? (
        <EmptyState
          title="Nobody enrolled yet"
          body="Add the people who work at this cart. They can sign in straight away — their record is waiting for the email address you enter."
        />
      ) : (
        <ul className="space-y-2">
          {staff.map((member) => (
            <li key={member.id}>
              <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {member.fullName}
                    {member.role !== "staff" && (
                      <Pill tone="accent">{ROLE_LABELS[member.role]}</Pill>
                    )}
                    {!member.active && <Pill tone="neutral">Inactive</Pill>}
                    {!member.clerkUserId && <Pill tone="warning">Never signed in</Pill>}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-muted">{member.email}</p>

                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>
                      {member.cartId ? (cartName.get(member.cartId) ?? "Unknown cart") : "No cart"}
                    </span>
                    <span>{shiftLabel(member)}</span>
                    <span>
                      {member.monthlySalary === null
                        ? "No salary set"
                        : `${formatMoney(member.monthlySalary)}/month · ${member.workingDaysPerMonth} days`}
                    </span>
                  </p>
                </div>

                <button onClick={() => setEditing({ member })} className="btn btn-ghost">
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

function shiftLabel(member: StaffRecord): string {
  if (!member.shiftStart) return "No shift";
  const end = member.shiftEnd ? `–${member.shiftEnd.slice(0, 5)}` : "";
  return `${member.shiftStart.slice(0, 5)}${end} · ${member.graceMinutes}m grace`;
}

function StaffForm({
  member,
  carts,
  canSetRoles,
  onDone,
}: {
  member: StaffRecord | null;
  carts: CartRecord[];
  canSetRoles: boolean;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveStaffAction, IDLE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <Card className="p-4">
      <form action={action} className="space-y-5">
        {member && <input type="hidden" name="id" value={member.id} />}

        {/* Who ------------------------------------------------------------ */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Email address"
            hint="The Google address they sign in with. Their role follows this address."
          >
            <input
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              required
              placeholder="name@gmail.com"
              className="input"
            />
          </Field>
          <Field label="Full name">
            <input name="fullName" defaultValue={member?.fullName ?? ""} required className="input" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone (optional)">
            <input name="phone" defaultValue={member?.phone ?? ""} className="input" />
          </Field>
          <Field label="Cart">
            <select name="cartId" defaultValue={member?.cartId ?? ""} className="input">
              <option value="">— none —</option>
              {carts.map((cart) => (
                <option key={cart.id} value={cart.id}>
                  {cart.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Role"
            hint={canSetRoles ? undefined : "Only an owner can change a role."}
          >
            <select
              name="role"
              defaultValue={member?.role ?? "staff"}
              disabled={!canSetRoles}
              className="input"
            >
              {ROLES.map((role: Role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {/*
              A disabled control posts nothing, which would fail the action's
              role validation on every save a manager makes. This carries the
              unchanged value instead; the server discards it for anybody
              without `staff:role:write` either way.
            */}
            {!canSetRoles && (
              <input type="hidden" name="role" value={member?.role ?? "staff"} />
            )}
          </Field>
        </div>

        {/*
          What each role actually grants. A <select> cannot carry this per
          option, and handing somebody the console is not a decision to make
          from a one-word label.
        */}
        {canSetRoles && (
          <dl className="space-y-1 rounded-xl bg-surface-muted px-3.5 py-3 text-xs">
            {ROLES.map((role: Role) => (
              <div key={role} className="flex flex-wrap gap-x-2">
                <dt className="font-medium">{ROLE_LABELS[role]}:</dt>
                <dd className="text-muted">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Shift ----------------------------------------------------------- */}
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">Shift</legend>
          <p className="text-sm font-medium">Shift</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Check in at">
              <input
                name="shiftStart"
                type="time"
                defaultValue={member?.shiftStart?.slice(0, 5) ?? ""}
                className="input"
              />
            </Field>
            <Field label="Check out at">
              <input
                name="shiftEnd"
                type="time"
                defaultValue={member?.shiftEnd?.slice(0, 5) ?? ""}
                className="input"
              />
            </Field>
            <Field label="Grace (minutes)" hint="Arriving inside this still counts as on time.">
              <input
                name="graceMinutes"
                type="number"
                min={0}
                max={240}
                defaultValue={member?.graceMinutes ?? 30}
                required
                className="input"
              />
            </Field>
          </div>

          <p className="text-xs text-muted text-pretty">
            Leave the times blank and nothing is ever counted late — punches are still
            recorded, just without a lateness figure.
          </p>
        </fieldset>

        {/* Pay -------------------------------------------------------------- */}
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">Pay</legend>
          <p className="text-sm font-medium">Pay</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Monthly salary">
              <input
                name="monthlySalary"
                type="number"
                min={0}
                step="1"
                defaultValue={member?.monthlySalary ?? ""}
                placeholder="e.g. 18000"
                className="input"
              />
            </Field>
            <Field label="Working days / month" hint="26 is a six-day week.">
              <input
                name="workingDaysPerMonth"
                type="number"
                min={1}
                max={31}
                defaultValue={member?.workingDaysPerMonth ?? 26}
                required
                className="input"
              />
            </Field>
            <Field label="Deduction per late day" hint="Set 0 to record lateness without docking pay.">
              <input
                name="lateDeduction"
                type="number"
                min={0}
                step="1"
                defaultValue={member?.lateDeduction ?? 0}
                required
                className="input"
              />
            </Field>
          </div>

          <p className="text-xs text-muted text-pretty">
            Pay is the monthly salary divided by working days, times the days actually
            present, less the deduction for each late day. To make a late day a half
            day, set the deduction to half of one day&rsquo;s pay.
          </p>
        </fieldset>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={member?.active ?? true}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Active — inactive staff cannot punch and are left out of payroll.
        </label>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5">
          <SubmitButton>{member ? "Save changes" : "Enrol"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
