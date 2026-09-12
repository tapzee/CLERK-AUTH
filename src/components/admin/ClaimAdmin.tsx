"use client";

import { useActionState, startTransition } from "react";

import { claimAdminAction } from "@/app/admin/actions";
import { IDLE, type ActionState } from "@/app/admin/action-state";

/**
 * Bootstrap for an empty staff table.
 *
 * Managing staff needs a role and granting a role needs the panel, so the first
 * account has to come from somewhere. The action refuses once any staff row
 * exists, which closes this door permanently after the first use.
 */
export function ClaimAdmin({ clerkUserId }: { clerkUserId: string }) {
  const [state, action, pending] = useActionState<ActionState>(claimAdminAction, IDLE);

  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">Nobody is enrolled yet</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted text-pretty">
        Make this account the first admin. Once that is done this option
        disappears, and further staff are added from the panel itself.
      </p>

      <code className="mx-auto mt-4 block max-w-sm overflow-x-auto rounded-lg bg-surface-muted px-3.5 py-2.5 font-mono text-xs">
        {clerkUserId}
      </code>

      <button
        onClick={() => startTransition(() => action())}
        disabled={pending}
        className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Make me admin"}
      </button>

      {state.error && (
        <p className="mt-4 text-sm text-[color:var(--danger)]">{state.error}</p>
      )}
    </div>
  );
}
