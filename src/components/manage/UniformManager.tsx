"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteReferenceAction,
  saveUniformAction,
  uploadReferenceAction,
} from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { UniformRecord } from "@/lib/manage/uniforms";
import { ITEM_KEYS, ITEM_LABELS, REFERENCE_KEYS, type ItemKey } from "@/lib/uniform/items";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

/**
 * What "in uniform" means, expressed as weights out of 100 and a pass mark.
 *
 * The weights are the dial that matters: they decide whether a missing cap is
 * a refusal or a deduction, without anybody touching a prompt.
 */

type Editing = { uniform: UniformRecord | null } | null;

export function UniformManager({ uniforms }: { uniforms: UniformRecord[] }) {
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Uniforms"
        description="Attach one to a cart, and every selfie taken there is judged against it."
        action={
          <button onClick={() => setEditing({ uniform: null })} className="btn btn-primary">
            Add uniform
          </button>
        }
      />

      {editing && (
        <UniformForm
          key={editing.uniform?.id ?? "new"}
          uniform={editing.uniform}
          onDone={() => setEditing(null)}
        />
      )}

      {uniforms.length === 0 ? (
        <EmptyState
          title="No uniforms defined"
          body="Carts without one fall back to a generic cap, apron and shirt. Define a uniform to check against your actual garments and logo."
        />
      ) : (
        <ul className="space-y-3">
          {uniforms.map((uniform) => (
            <li key={uniform.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-medium">{uniform.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Pass at {uniform.passScore}/100 · {uniform.cartCount}{" "}
                      {uniform.cartCount === 1 ? "cart" : "carts"}
                    </p>
                    {uniform.promptNotes && (
                      <p className="mt-1.5 max-w-prose text-sm text-muted text-pretty">
                        {uniform.promptNotes}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setEditing({ uniform })} className="btn btn-ghost">
                    Edit
                  </button>
                </div>

                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {ITEM_KEYS.map((key) => (
                    <li key={key}>
                      <Pill tone={uniform.weights[key] > 0 ? "accent" : "neutral"}>
                        {ITEM_LABELS[key]} {uniform.weights[key]}
                      </Pill>
                    </li>
                  ))}
                </ul>

                <References uniform={uniform} />
              </Card>
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
  uniform: UniformRecord | null;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveUniformAction, IDLE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <Card className="p-4">
      <form action={action} className="space-y-5">
        {uniform && <input type="hidden" name="id" value={uniform.id} />}

        <Field label="Name">
          <input name="name" defaultValue={uniform?.name ?? ""} required className="input" />
        </Field>

        <Field
          label="Describe the uniform"
          hint="Given to the check word for word. Be specific: colours, cut, where the logo sits."
        >
          <textarea
            name="promptNotes"
            rows={3}
            defaultValue={uniform?.promptNotes ?? ""}
            placeholder="Navy blue polo shirt, black apron with the logo on the chest, black cap."
            className="input resize-y"
          />
        </Field>

        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">Scoring</legend>
          <p className="text-sm font-medium">What counts, and how much</p>

          <div className="grid gap-3 sm:grid-cols-5">
            {ITEM_KEYS.map((key) => (
              <Field key={key} label={ITEM_LABELS[key]}>
                <input
                  name={`weight.${key}`}
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={uniform?.weights[key] ?? 20}
                  className="input"
                />
              </Field>
            ))}
          </div>

          <Field
            label="Pass mark"
            hint="A selfie scoring below this is refused and the worker is asked to fix it."
          >
            <input
              name="passScore"
              type="number"
              min={0}
              max={100}
              defaultValue={uniform?.passScore ?? 70}
              required
              className="input sm:w-32"
            />
          </Field>

          <p className="text-xs text-muted text-pretty">
            Weight 0 means the item is still reported but never costs anybody a
            punch. An item worn badly scores half its weight.
          </p>
        </fieldset>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5">
          <SubmitButton>{uniform ? "Save changes" : "Create uniform"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Photos of the real garments.
 *
 * Sent alongside every selfie, which is the only way the logo can be judged at
 * all -- a written description cannot tell one logo from another.
 */
function References({ uniform }: { uniform: UniformRecord }) {
  const byKind = new Map(uniform.references.map((reference) => [reference.kind, reference]));

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="label">Reference photos</p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {REFERENCE_KEYS.map((kind) => (
          <li key={kind}>
            <ReferenceSlot
              uniformId={uniform.id}
              kind={kind}
              url={byKind.get(kind)?.url ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceSlot({
  uniformId,
  kind,
  url,
}: {
  uniformId: string;
  kind: ItemKey;
  url: string | null;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(
    uploadReferenceAction,
    IDLE,
  );
  const [, remove] = useActionState<ActionState, FormData>(deleteReferenceAction, IDLE);

  return (
    <div className="space-y-1.5">
      <div className="aspect-square overflow-hidden rounded-xl border border-border bg-surface-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={url} alt={ITEM_LABELS[kind]} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-[11px] text-muted">
            No photo
          </div>
        )}
      </div>

      <p className="text-xs font-medium">{ITEM_LABELS[kind]}</p>

      <form action={upload} className="space-y-1">
        <input type="hidden" name="uniformProfileId" value={uniformId} />
        <input type="hidden" name="kind" value={kind} />
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="w-full text-[11px] text-muted file:mr-2 file:rounded-full file:border-0 file:bg-surface-muted file:px-2 file:py-1 file:text-[11px]"
        />
        <SubmitButton pendingLabel="Uploading…" variant="ghost">
          {url ? "Replace" : "Upload"}
        </SubmitButton>
        {uploadState.error && (
          <p className="text-[11px] text-danger text-pretty">{uploadState.error}</p>
        )}
      </form>

      {url && (
        <form action={remove}>
          <input type="hidden" name="uniformProfileId" value={uniformId} />
          <input type="hidden" name="kind" value={kind} />
          <SubmitButton pendingLabel="Removing…" variant="danger">
            Remove
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
