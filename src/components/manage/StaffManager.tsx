"use client";

import { useActionState, useEffect, useState } from "react";
import {
  UserPlus,
  User,
  Store,
  Clock,
  Banknote,
  Edit3,
  Shield,
} from "lucide-react";

import { saveStaffAction } from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/rbac";
import type { CartRecord } from "@/lib/manage/carts";
import type { StaffRecord } from "@/lib/manage/staff";
import { formatMoney } from "@/lib/payroll/calculate";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

type Editing = { member: StaffRecord | null } | null;

export function StaffManager({
  staff,
  carts,
  canSetRoles,
  currentStaffId,
}: {
  staff: StaffRecord[];
  carts: CartRecord[];
  canSetRoles: boolean;
  currentStaffId?: string;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const cartName = new Map(carts.map((cart) => [cart.id, cart.name]));

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Staff Directory"
        description="Enrol team members by Google email. Access and permissions match their login account."
        action={
          <button
            onClick={() => setEditing({ member: null })}
            disabled={carts.length === 0}
            title={carts.length === 0 ? "Add a cart first." : undefined}
            className="btn btn-primary"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add staff</span>
          </button>
        }
      />

      {editing && (
        <StaffForm
          key={editing.member?.id ?? "new"}
          member={editing.member}
          carts={carts}
          canSetRoles={canSetRoles}
          currentStaffId={currentStaffId}
          onDone={() => setEditing(null)}
        />
      )}

      {staff.length === 0 ? (
        <EmptyState
          icon={<User className="h-5 w-5" />}
          title="Nobody enrolled yet"
          body="Add staff members and assign them to a cart. They can sign in immediately with their Google account."
        />
      ) : (
        <ul className="space-y-2.5">
          {staff.map((member) => (
            <li key={member.id}>
              <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 transition-all hover:border-border">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-bold text-accent">
                    {member.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground text-sm sm:text-base">
                        {member.fullName}
                      </p>
                      {member.role !== "staff" && (
                        <Pill tone="accent" className="text-[10px]">
                          <Shield className="h-3 w-3 inline mr-0.5" />
                          {ROLE_LABELS[member.role]}
                        </Pill>
                      )}
                      {!member.active && <Pill tone="neutral">Inactive</Pill>}
                      {!member.clerkUserId && <Pill tone="warning">Never signed in</Pill>}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-muted">{member.email}</p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Store className="h-3 w-3 text-accent" />
                        {member.cartId ? (cartName.get(member.cartId) ?? "Unknown cart") : "No cart"}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3 text-accent" />
                        {shiftLabel(member)}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Banknote className="h-3 w-3 text-accent" />
                        {member.monthlySalary === null
                          ? "No salary set"
                          : `${formatMoney(member.monthlySalary)}/mo (${member.workingDaysPerMonth}d)`}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setEditing({ member })}
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

function shiftLabel(member: StaffRecord): string {
  if (member.role === "manager") return "Flexible hours";
  if (!member.shiftStart) return "No shift";
  const end = member.shiftEnd ? `–${member.shiftEnd.slice(0, 5)}` : "";
  return `${member.shiftStart.slice(0, 5)}${end} (${member.graceMinutes}m grace)`;
}

function StaffForm({
  member,
  carts,
  canSetRoles,
  currentStaffId,
  onDone,
}: {
  member: StaffRecord | null;
  carts: CartRecord[];
  canSetRoles: boolean;
  currentStaffId?: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveStaffAction, IDLE);
  const [selectedRole, setSelectedRole] = useState<Role>(member?.role ?? "staff");

  const isSelf = Boolean(member && currentStaffId && member.id === currentStaffId);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <Card className="border-accent/30 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
        <p className="font-bold text-base text-foreground">
          {member ? `Edit Staff · ${member.fullName}` : "Enrol New Staff Member"}
        </p>
      </div>

      <form action={action} className="space-y-5">
        {member && <input type="hidden" name="id" value={member.id} />}

        {/* Identity Section */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            label="Email Address"
            hint="The Google address used to sign in. Permissions attach automatically."
          >
            <input
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              required
              placeholder="worker@gmail.com"
              className="input"
            />
          </Field>
          <Field label="Full Name">
            <input
              name="fullName"
              defaultValue={member?.fullName ?? ""}
              required
              placeholder="e.g. Alex Sharma"
              className="input"
            />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3">
          <Field label="Phone (optional)">
            <input
              name="phone"
              defaultValue={member?.phone ?? ""}
              placeholder="+91 98765 43210"
              className="input"
            />
          </Field>
          <Field label="Assigned Cart">
            <select name="cartId" defaultValue={member?.cartId ?? ""} className="input">
              <option value="">— Unassigned —</option>
              {carts.map((cart) => (
                <option key={cart.id} value={cart.id}>
                  {cart.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="System Role"
            hint={
              isSelf
                ? "You cannot change your own role (Protection against accidental lockout)."
                : canSetRoles
                ? undefined
                : "Only an owner can change roles."
            }
          >
            <select
              name="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              disabled={!canSetRoles || isSelf}
              className="input disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ROLES.map((role: Role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {(!canSetRoles || isSelf) && (
              <input type="hidden" name="role" value={member?.role ?? "staff"} />
            )}
          </Field>
        </div>

        {canSetRoles && (
          <dl className="space-y-1.5 rounded-xl border border-border/50 bg-surface-muted/50 p-3.5 text-xs">
            {ROLES.map((role: Role) => (
              <div key={role} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-foreground">{ROLE_LABELS[role]}:</dt>
                <dd className="text-muted">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Shift Section */}
        {selectedRole === "manager" ? (
          <div className="rounded-xl border border-accent/20 bg-accent-soft/30 p-4">
            <div className="flex items-center gap-2 text-accent">
              <Clock className="h-4 w-4" />
              <p className="font-bold text-xs uppercase tracking-wider">Flexible Working Hours</p>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Managers have flexible working hours. Fixed shift times, grace window, and late deductions do not apply.
              Daily attendance punch is still required to calculate monthly payable days.
            </p>
            <input type="hidden" name="shiftStart" value="" />
            <input type="hidden" name="shiftEnd" value="" />
            <input type="hidden" name="graceMinutes" value="0" />
          </div>
        ) : (
          <fieldset className="space-y-3.5 border-t border-border/70 pt-4">
            <legend className="sr-only">Shift Configuration</legend>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                Shift &amp; Grace Settings
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              <Field label="Shift Start (Check In)">
                <input
                  name="shiftStart"
                  type="time"
                  defaultValue={member?.shiftStart?.slice(0, 5) ?? ""}
                  className="input font-mono"
                />
              </Field>
              <Field label="Shift End (Check Out)">
                <input
                  name="shiftEnd"
                  type="time"
                  defaultValue={member?.shiftEnd?.slice(0, 5) ?? ""}
                  className="input font-mono"
                />
              </Field>
              <Field label="Grace Window (Minutes)" hint="Arrivals within grace count as on time.">
                <input
                  name="graceMinutes"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={member?.graceMinutes ?? 30}
                  required
                  className="input font-mono"
                />
              </Field>
            </div>
          </fieldset>
        )}

        {/* Pay Section */}
        <fieldset className="space-y-3.5 border-t border-border/70 pt-4">
          <legend className="sr-only">Salary Configuration</legend>
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-accent" />
            <p className="font-bold text-xs uppercase tracking-wider text-foreground">
              Compensation &amp; Deductions
            </p>
          </div>

          <div className={`grid gap-3.5 ${selectedRole === "manager" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            <Field label="Monthly Base Salary">
              <input
                name="monthlySalary"
                type="number"
                min={0}
                step="1"
                defaultValue={member?.monthlySalary ?? ""}
                placeholder="e.g. 18000"
                className="input font-mono"
              />
            </Field>
            <Field label="Working Days / Month" hint="26 days = 6-day work week.">
              <input
                name="workingDaysPerMonth"
                type="number"
                min={1}
                max={31}
                defaultValue={member?.workingDaysPerMonth ?? 26}
                required
                className="input font-mono"
              />
            </Field>
            {selectedRole !== "manager" ? (
              <Field label="Late Day Deduction" hint="0 = log lateness without docking pay.">
                <input
                  name="lateDeduction"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={member?.lateDeduction ?? 0}
                  required
                  className="input font-mono"
                />
              </Field>
            ) : (
              <input type="hidden" name="lateDeduction" value="0" />
            )}
          </div>
          {selectedRole === "manager" && (
            <p className="text-[11px] text-muted">
              💡 Daily attendance is required. Missed days will prorate monthly salary based on working days. Lateness deduction does not apply to managers.
            </p>
          )}
        </fieldset>

        <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            name="active"
            defaultChecked={member?.active ?? true}
            className="h-4 w-4 accent-accent rounded"
          />
          <span>Active — inactive staff cannot check in and are excluded from payroll.</span>
        </label>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5 pt-2">
          <SubmitButton>{member ? "Save Changes" : "Enrol Staff"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
