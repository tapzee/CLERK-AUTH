"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Shirt,
  Plus,
  Edit3,
  Upload,
  Trash2,
  Camera,
  PencilLine,
  ShieldCheck,
  Store,
  ScanEye,
} from "lucide-react";

import {
  deleteReferenceAction,
  saveUniformAction,
  updateReferenceDescriptionAction,
  uploadReferenceAction,
} from "@/app/manage/actions";
import { shrinkImageFile } from "@/lib/image";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { UniformReference, UniformRecord } from "@/lib/manage/uniforms";
import { ITEM_KEYS, ITEM_LABELS, REFERENCE_KEYS, type ItemKey } from "@/lib/uniform/items";
import { Card, EmptyState, Field, Pill, SectionHeading } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

type Editing = { uniform: UniformRecord | null } | null;

export function UniformManager({ uniforms }: { uniforms: UniformRecord[] }) {
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Uniform Standards"
        description="Configure scoring weights and reference photos for automated visual dress-code verification."
        action={
          <button onClick={() => setEditing({ uniform: null })} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            <span>Add uniform</span>
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
          icon={<Shirt className="h-5 w-5" />}
          title="No custom uniform profiles"
          body="Carts without custom profiles use generic cap, apron, and shirt rules. Define a uniform profile to check brand garments and logo placement."
        />
      ) : (
        <ul className="space-y-3">
          {uniforms.map((uniform) => (
            <li key={uniform.id}>
              <Card className="p-5 transition-all hover:border-border">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <Shirt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm sm:text-base">
                        {uniform.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                          Pass score: {uniform.passScore}/100
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Store className="h-3.5 w-3.5" />
                          {uniform.cartCount} {uniform.cartCount === 1 ? "cart" : "carts"} linked
                        </span>
                      </div>
                      {uniform.promptNotes && (
                        <p className="mt-2 text-xs text-muted text-pretty max-w-prose">
                          {uniform.promptNotes}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditing({ uniform })}
                    className="btn btn-ghost px-3 py-1.5 text-xs sm:text-sm"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="label mb-1.5">What Counts Toward The Score</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {ITEM_KEYS.map((key) => (
                      <li key={key}>
                        <Pill
                          tone={uniform.weights[key] > 0 ? "accent" : "neutral"}
                          className="font-mono text-xs"
                        >
                          {ITEM_LABELS[key]}: {uniform.weights[key]}%
                        </Pill>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-muted text-pretty">
                    Split equally between whichever items have a reference photo below,
                    plus overall turnout. Upload a photo to bring an item in.
                  </p>
                </div>

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
    <Card className="border-accent/30 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <p className="font-semibold text-base text-foreground">
          {uniform ? `Edit Uniform · ${uniform.name}` : "Define Uniform Standard"}
        </p>
      </div>

      <form action={action} className="space-y-5">
        {uniform && <input type="hidden" name="id" value={uniform.id} />}

        <Field label="Uniform Profile Name">
          <input
            name="name"
            defaultValue={uniform?.name ?? ""}
            required
            placeholder="e.g. Standard Summer Uniform"
            className="input"
          />
        </Field>

        <Field
          label="Visual Specification &amp; Guidance"
          hint="Provided to the vision AI model verbatim. Describe colours, cut, logo placement, etc."
        >
          <textarea
            name="promptNotes"
            rows={3}
            defaultValue={uniform?.promptNotes ?? ""}
            placeholder="Navy blue polo shirt, black apron with white emblem on chest, black baseball cap facing forward."
            className="input resize-y"
          />
        </Field>

        <fieldset className="space-y-3.5 border-t border-border pt-4">
          <legend className="sr-only">Passing threshold</legend>
          <Field
            label="Passing Score Threshold (out of 100)"
            hint="Selfies scoring below this mark are rejected at the cart, requiring a retake. There is nothing else to set here — an item counts, weighted equally with the rest, the moment you upload its reference photo below."
          >
            <input
              name="passScore"
              type="number"
              min={0}
              max={100}
              defaultValue={uniform?.passScore ?? 70}
              required
              className="input font-mono sm:w-32"
            />
          </Field>
        </fieldset>

        <FormFeedback state={state} />

        <div className="flex flex-wrap gap-2.5 pt-2">
          <SubmitButton>{uniform ? "Save Changes" : "Create Profile"}</SubmitButton>
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function References({ uniform }: { uniform: UniformRecord }) {
  const byKind = new Map(uniform.references.map((reference) => [reference.kind, reference]));

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="label mb-0.5">Reference Garment Photos</p>
      <p className="mb-2 text-[11px] text-muted text-pretty">
        Every check reads the logo photo directly, for an exact match. Everything
        else is written up in words the moment you upload it, and that wording is
        what a check reads from then on — not the photo again.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {REFERENCE_KEYS.map((kind) => (
          <li key={kind}>
            <ReferenceSlot uniformId={uniform.id} kind={kind} reference={byKind.get(kind)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceSlot({
  uniformId,
  kind,
  reference,
}: {
  uniformId: string;
  kind: ItemKey;
  reference: UniformReference | undefined;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(
    async (previous, data) => {
      const picked = data.get("file");
      if (picked instanceof File && picked.size > 0) {
        // Photos picked off a phone or a disk run to several megabytes, which
        // the Server Action body cap rejects before the action can run -- so
        // the size has to come down here, not be explained server-side.
        const shrunk = await shrinkImageFile(picked).catch(() => null);
        if (!shrunk) return { ok: false, error: "That file could not be read as an image." };
        data.set("file", shrunk);
      }
      return uploadReferenceAction(previous, data);
    },
    IDLE,
  );
  const [, remove] = useActionState<ActionState, FormData>(deleteReferenceAction, IDLE);

  // A locally chosen file previews immediately, before the upload round-trip --
  // revoked on unmount/replacement since object URLs otherwise leak.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const url = preview ?? reference?.url ?? null;
  const isLogo = kind === "logo";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface/40 p-2.5">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-neutral-900">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed/object URL
          <img src={url} alt={ITEM_LABELS[kind]} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center p-2 text-center text-[10px] text-muted">
            <Camera className="mb-1 h-5 w-5 text-muted/40" />
            <span>No photo</span>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold text-foreground text-center">{ITEM_LABELS[kind]}</p>

      <form action={upload} className="space-y-1.5">
        <input type="hidden" name="uniformProfileId" value={uniformId} />
        <input type="hidden" name="kind" value={kind} />
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={onFileChange}
          className="w-full text-[10px] text-muted file:mr-1.5 file:rounded-md file:border-0 file:bg-surface-muted file:px-2 file:py-0.5 file:text-[10px] cursor-pointer"
        />
        <SubmitButton
          pendingLabel={isLogo ? "Saving…" : "Writing it up…"}
          variant="ghost"
          icon={<Upload className="h-3 w-3" />}
        >
          {url ? "Replace" : "Upload"}
        </SubmitButton>
        {uploadState.error && (
          <p className="text-[10px] text-danger text-pretty">{uploadState.error}</p>
        )}
      </form>

      {isLogo ? (
        url && (
          <p className="flex items-start gap-1 text-[10px] text-muted text-pretty">
            <ScanEye className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
            Always sent as this photo, for an exact match.
          </p>
        )
      ) : (
        // Keyed on the saved text: once a save lands and revalidation brings
        // a new value down through props, this remounts fresh with its own
        // `editing` state reset to false -- closing the editor on success
        // without an effect or a ref read during render.
        <DescriptionEditor
          key={reference?.description ?? "none"}
          uniformId={uniformId}
          kind={kind}
          description={reference?.description ?? null}
        />
      )}

      {url && (
        <form action={remove}>
          <input type="hidden" name="uniformProfileId" value={uniformId} />
          <input type="hidden" name="kind" value={kind} />
          <SubmitButton
            pendingLabel="Removing…"
            variant="danger"
            icon={<Trash2 className="h-3 w-3" />}
          >
            Delete
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

/**
 * What the check actually reads for this item, and a way to fix it by hand.
 *
 * The wording is written once by the model when the photo is uploaded --
 * shown here so an owner can see exactly what a check compares against, and
 * correct it directly (a wrong colour, say) without re-uploading the photo
 * just to trigger another AI guess.
 */
function DescriptionEditor({
  uniformId,
  kind,
  description,
}: {
  uniformId: string;
  kind: ItemKey;
  description: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await updateReferenceDescriptionAction(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    IDLE,
  );

  if (!editing) {
    return (
      <div className="space-y-1">
        {description ? (
          <p className="text-[10px] text-muted text-pretty">&ldquo;{description}&rdquo;</p>
        ) : (
          <p className="text-[10px] text-muted/70 italic">
            Written up automatically once a photo is uploaded.
          </p>
        )}
        {description && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
          >
            <PencilLine className="h-3 w-3" />
            Fix the wording
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="uniformProfileId" value={uniformId} />
      <input type="hidden" name="kind" value={kind} />
      <textarea
        name="description"
        defaultValue={description ?? ""}
        rows={2}
        required
        className="input resize-y text-[10px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…" variant="ghost">
          Save wording
        </SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[10px] font-medium text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {state.error && <p className="text-[10px] text-danger text-pretty">{state.error}</p>}
    </form>
  );
}
