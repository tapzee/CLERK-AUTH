"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  deleteReferenceAction,
  IDLE,
  saveUniformAction,
  uploadReferenceAction,
  type ActionState,
} from "@/app/admin/actions";
import type { AdminUniform } from "@/lib/attendance/admin";
import { shrinkImageFile } from "@/lib/image";

/**
 * Mirrors ITEM_KEYS in the model module, which cannot be imported here — it
 * lives behind `server-only`.
 */
const ITEMS = [
  { key: "cap", label: "Cap or hairnet" },
  { key: "apron", label: "Apron" },
  { key: "shirt", label: "Uniform shirt" },
  { key: "logo", label: "Company logo" },
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
            What the check looks for, and how the score is worked out.
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
          cap, apron and shirt with no reference photos.
        </p>
      ) : (
        <ul className="space-y-2">
          {uniforms.map((uniform) => (
            <li
              key={uniform.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{uniform.name}</p>
                <p className="mt-0.5 text-sm text-muted text-pretty">
                  {uniform.promptNotes ?? "No description — the check will be generic."}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Pass mark {uniform.passScore}/100 ·{" "}
                  {ITEMS.filter((item) => uniform.weights[item.key] > 0)
                    .map((item) => `${item.key} ${uniform.weights[item.key]}`)
                    .join(" · ")}
                  {" · "}
                  {uniform.cartCount} cart{uniform.cartCount === 1 ? "" : "s"}
                </p>

                {uniform.references.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {uniform.references.map((reference) =>
                      reference.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                        <img
                          key={reference.kind}
                          src={reference.url}
                          alt={`Reference for ${reference.kind}`}
                          title={reference.kind}
                          className="h-11 w-11 rounded-lg border border-border object-cover"
                        />
                      ) : null,
                    )}
                  </div>
                )}
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
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4">
      <form action={action} className="space-y-4">
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
            Goes into the check verbatim. Plain description of garments and
            colours — the reference photos below cover what words cannot.
          </span>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">
            Score weights
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2.5 text-sm">
                <input
                  type="number"
                  name={`weight.${item.key}`}
                  min={0}
                  max={100}
                  defaultValue={uniform?.weights[item.key] ?? DEFAULTS[item.key]}
                  className={`${INPUT} w-20`}
                />
                {item.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted text-pretty">
            Each item&rsquo;s share of the score. They are normalised, so they do
            not have to add to 100 — only the ratio between them matters. Set an
            item to 0 to have it reported but not scored.
          </p>
        </fieldset>

        <Field label="Pass mark">
          <input
            type="number"
            name="passScore"
            min={0}
            max={100}
            defaultValue={uniform?.passScore ?? 70}
            required
            className={`${INPUT} w-24`}
          />
          <span className="mt-1 block text-xs text-muted text-pretty">
            A check passes at or above this. Note the interaction with the
            weights: at 70 with the defaults above, someone missing only their
            cap still scores 75 and passes. Raise the mark past 80 if every item
            has to be present.
          </span>
          <span className="mt-1 block text-xs text-muted text-pretty">
            When the photo is too poor to be sure, the verdict is
            &ldquo;unclear&rdquo; rather than a guess — it only commits when the
            best and worst readings land on the same side of this number.
          </span>
        </Field>

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

      {/* Reference photos need an id to attach to, so they appear once the
          uniform itself has been saved. */}
      {uniform ? (
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted">Reference photos</p>
          <p className="mt-1 text-xs text-muted text-pretty">
            A clear photo of each real item. The logo one matters most — it is the
            only way the check can tell your logo from any other print.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ITEMS.map((item) => (
              <ReferenceSlot
                key={item.key}
                uniformId={uniform.id}
                kind={item.key}
                label={item.label}
                url={uniform.references.find((r) => r.kind === item.key)?.url ?? null}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="border-t border-border pt-4 text-xs text-muted">
          Save the uniform first, then reference photos can be attached to it.
        </p>
      )}
    </div>
  );
}

const DEFAULTS: Record<string, number> = { cap: 25, apron: 25, shirt: 30, logo: 20 };

function ReferenceSlot({
  uniformId,
  kind,
  label,
  url,
}: {
  uniformId: string;
  kind: string;
  label: string;
  url: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const [uploadState, upload] = useActionState<ActionState, FormData>(
    uploadReferenceAction,
    IDLE,
  );
  const [removeState, remove] = useActionState<ActionState, FormData>(
    deleteReferenceAction,
    IDLE,
  );

  async function onPick(file: File) {
    setBusy(true);
    try {
      // Phone photos routinely exceed the request limit, and the check reads
      // this at a fixed resolution anyway, so it is shrunk before it is sent.
      const blob = await shrinkImageFile(file);

      const form = new FormData();
      form.append("uniformProfileId", uniformId);
      form.append("kind", kind);
      form.append("file", blob, `${kind}.jpg`);
      startTransition(() => upload(form));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onRemove() {
    const form = new FormData();
    form.append("uniformProfileId", uniformId);
    form.append("kind", kind);
    startTransition(() => remove(form));
  }

  const error = uploadState.error ?? removeState.error;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img
            src={url}
            alt={`Reference for ${label}`}
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[11px] text-muted">
            none
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="underline hover:text-foreground disabled:opacity-50"
            >
              {busy ? "Uploading…" : url ? "Replace" : "Upload"}
            </button>
            {url && (
              <button
                type="button"
                onClick={onRemove}
                className="text-[color:var(--danger)] underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
        }}
      />

      {error && (
        <p className="mt-2 text-xs text-[color:var(--danger)]">{error}</p>
      )}
    </div>
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
