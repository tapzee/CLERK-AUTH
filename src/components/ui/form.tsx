"use client";

import { useFormStatus } from "react-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ActionState } from "@/lib/manage/action-state";

/**
 * The interactive half of the UI kit.
 */

/**
 * A submit button that disables itself and shows a micro-spinner while its form is in flight.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  disabled = false,
  name,
  value,
  icon,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  name?: string;
  value?: string;
  icon?: React.ReactNode;
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
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-current" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          {icon}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

/** The error or confirmation a Server Action handed back */
export function FormFeedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger animate-in fade-in slide-in-from-top-1"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-pretty">{state.error}</span>
      </div>
    );
  }

  if (state.ok && state.message) {
    return (
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-medium text-success animate-in fade-in slide-in-from-top-1"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-pretty">{state.message}</span>
      </div>
    );
  }

  return null;
}
