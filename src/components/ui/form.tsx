"use client";

import { useFormStatus } from "react-dom";

import type { ActionState } from "@/lib/manage/action-state";

/**
 * The interactive half of the UI kit.
 *
 * Split from `primitives.tsx` so those stay server components: a `"use client"`
 * directive at the top of a shared module would pull every page that imports a
 * Card into the client bundle.
 */

/**
 * A submit button that disables itself while its form is in flight.
 *
 * `useFormStatus` reads the state of the nearest enclosing `<form>`, so this
 * needs no props and no wiring at the call site -- which is what keeps a
 * double-submitted payroll approval from being one forgotten prop away.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  /**
   * Posted alongside the form when *this* button submits it, which is how one
   * form can offer two outcomes -- approve and decline -- without two forms or
   * a hidden radio group.
   */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`btn btn-${variant}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** The error or confirmation a Server Action handed back. */
export function FormFeedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
      >
        {state.error}
      </p>
    );
  }

  if (state.ok && state.message) {
    return (
      <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-sm text-success">
        {state.message}
      </p>
    );
  }

  return null;
}
