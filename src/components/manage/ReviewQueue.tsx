"use client";

import { useActionState } from "react";

import { reviewPunchAction } from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { ReviewItem } from "@/lib/manage/attendance";
import {
  GRADE_LABELS,
  ITEM_KEYS,
  ITEM_LABELS,
  type ItemGrade,
} from "@/lib/uniform/items";
import { Card, EmptyState, LocalTime, Pill, type Tone } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

/**
 * The photos a person has to look at.
 *
 * Everything in this queue is already recorded and already counted for pay --
 * being here means the model could not settle the photo, not that the worker
 * did anything wrong. That framing matters, because a manager who reads this
 * screen as a list of offenders will clear it carelessly.
 */
export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to review"
        body="Every punch has a verdict. Photos land here only when the check cannot tell, or when it could not run at all."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.eventId}>
          <ReviewCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const [state, action] = useActionState<ActionState, FormData>(reviewPunchAction, IDLE);

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="aspect-[3/4] bg-black/90 sm:aspect-auto">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img
              src={item.photoUrl}
              alt={`Check-in selfie for ${item.staffName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-xs text-white/60">
              The photo is no longer available.
            </div>
          )}
        </div>

        <div className="space-y-3 p-4 pl-0 max-sm:pl-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-medium">{item.staffName}</p>
            <p className="text-sm text-muted">
              <LocalTime at={item.at} />
              {" · "}
              {new Date(`${item.businessDate}T00:00:00`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>

          <Verdict item={item} />

          <form action={action} className="space-y-3 border-t border-border pt-3">
            <input type="hidden" name="eventId" value={item.eventId} />

            <input
              name="note"
              placeholder="Note (optional) — what you saw in the photo"
              className="input"
            />

            <FormFeedback state={state} />

            {/*
              Two outcomes, one form. A submitter's `name`/`value` pair is
              included in the FormData it posts, so the action can tell which
              button was pressed without a radio group or a second form.
            */}
            <div className="flex flex-wrap gap-2.5">
              <SubmitButton name="decision" value="cleared" variant="primary">
                Uniform was fine
              </SubmitButton>
              <SubmitButton name="decision" value="flagged" variant="danger">
                Record a breach
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}

/** What the model said, item by item, so a manager knows where to look. */
function Verdict({ item }: { item: ReviewItem }) {
  const check = item.dressCheck;

  if (!check || check.status === "queued" || check.status === "running") {
    return (
      <p className="text-sm text-muted text-pretty">
        The check is still running. It will usually settle on its own within a
        minute — come back before deciding.
      </p>
    );
  }

  if (check.status === "failed") {
    return (
      <p className="text-sm text-muted text-pretty">
        The check could not run on this photo, so there is no machine opinion.
        Judge it yourself.
      </p>
    );
  }

  const tone: Tone = check.verdict === "fail" ? "danger" : "warning";

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2">
        <Pill tone={tone}>
          {check.score !== null ? `${check.score}/100` : (check.verdict ?? "unknown")}
        </Pill>
        {check.reason && <span className="text-sm text-muted text-pretty">{check.reason}</span>}
      </p>

      <ul className="flex flex-wrap gap-1.5">
        {ITEM_KEYS.map((key) => {
          const grade = (check.items?.[key] ?? "?") as ItemGrade;
          return (
            <li key={key}>
              <Pill tone={gradeTone(grade)}>
                {ITEM_LABELS[key]}: {GRADE_LABELS[grade]}
              </Pill>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function gradeTone(grade: ItemGrade): Tone {
  if (grade === "g") return "success";
  if (grade === "p") return "warning";
  if (grade === "n") return "danger";
  return "neutral";
}
