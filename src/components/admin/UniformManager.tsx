"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";

import { IDLE, saveUniformAction, type ActionState } from "@/app/admin/actions";
import type { AdminUniform } from "@/lib/attendance/admin";

/**
 * Mirrors UNIFORM_ITEMS in the server module, which cannot be imported here —
 * it lives behind `server-only`.
 */
const ITEMS = [
  { key: "cap", label: "Cap or hairnet" },
  { key: "apron", label: "Apron" },
  { key: "shirt", label: "Uniform shirt" },
] as const;

type Editing = { uniform: AdminUniform | null } | null;

export function UniformManager({ uniforms }: { uniforms: AdminUniform[] }) {
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Uniforms</h2>
          <p className="mt-0.5 text-sm text-muted">
            What the check looks for. Each cart points at one of these.
          </p>
        </div>
        <button
          onClick={() => setEditing({ uniform: null })}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Add uniform
        </button>
      </div>

      {editing && (
        <UniformForm
          key={editing.uniform?.id ?? "new"}
          uniform={editing.uniform}
          onDone={() => setEditing(null)}
        />
      )}

      {uniforms.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted text-pretty">
          No uniform defined. Until a cart has one, checks fall back to a generic
          cap, apron and shirt.
        </p>
      ) : (
        <ul className="space-y-2">
          {uniforms.map((uniform) => (
            <li
              key={uniform.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{uniform.name}</p>
                <p className="mt-0.5 text-sm text-muted text-pretty">
                  {uniform.promptNotes ?? "No description — the check will be generic."}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Required:{" "}
                  {ITEMS.filter((item) => uniform.requiredItems[item.key] !== false)
                    .map((item) => item.key)
                    .join(", ") || "nothing"}
                  {" · "}
                  {uniform.cartCount} cart{uniform.cartCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setEditing({ uniform })}
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

function UniformForm({
  uniform,
  onDone,
}: {
  uniform: AdminUniform | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveUniformAction,
    IDLE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      {uniform && <input type="hidden" name="id" value={uniform.id} />}

      <Field label="Name">
        <input
          name="name"
          defaultValue={uniform?.name ?? ""}
          required
          placeholder="Standard cart uniform"
          className={INPUT}
        />
      </Field>

      <Field label="Description">
        <textarea
          name="promptNotes"
          defaultValue={uniform?.promptNotes ?? ""}
          rows={3}
          placeholder="Navy blue collared polo, black apron worn over it, black cap covering the hair."
          className={INPUT}
        />
        <span className="mt-1 block text-xs text-muted text-pretty">
          This sentence goes into the check verbatim. Plain description of what
          staff should be wearing — colours and garments, nothing else. Wording it
          well matters more than anything else here.
        </span>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">
          Required for a pass
        </legend>
        <div className="space-y-1.5">
          {ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name={`required.${item.key}`}
                defaultChecked={uniform ? uniform.requiredItems[item.key] !== false : true}
                className="h-4 w-4"
              />
              {item.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted text-pretty">
          Unticked items are still reported, they just never fail a check on their
          own.
        </p>
      </fieldset>

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
          {pending ? "Saving…" : uniform ? "Save changes" : "Create uniform"}
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
