"use client";

import { useActionState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Check,
  AlertTriangle,
  Calendar,
  Camera,
} from "lucide-react";

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

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-5 w-5 text-success" />}
        title="Review Queue is Empty"
        body="All selfie check-ins have automated verdicts. Photos land here only when the vision check requires manual verification."
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
    <Card className="overflow-hidden p-0 transition-all hover:border-border">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="relative aspect-[3/4] bg-neutral-950 sm:aspect-auto">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img
              src={item.photoUrl}
              alt={`Selfie check-in for ${item.staffName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-xs text-white/50">
              <Camera className="mb-2 h-8 w-8 text-white/30" />
              <span>Photo expired or unavailable</span>
            </div>
          )}
          <div className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white backdrop-blur">
            Live Check-in
          </div>
        </div>

        <div className="flex flex-col justify-between p-5">
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent">
                  {item.staffName.charAt(0)}
                </div>
                <p className="font-semibold text-foreground">{item.staffName}</p>
              </div>
              <p className="flex items-center gap-1.5 font-mono text-xs text-muted">
                <Calendar className="h-3 w-3" />
                <span>
                  {new Date(`${item.businessDate}T00:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                {" · "}
                <LocalTime at={item.at} />
              </p>
            </div>

            <Verdict item={item} />
          </div>

          <form action={action} className="mt-4 space-y-3 border-t border-border/60 pt-4">
            <input type="hidden" name="eventId" value={item.eventId} />

            <input
              name="note"
              placeholder="Reviewer note (e.g. Cap was present but angled)"
              className="input text-xs"
            />

            <FormFeedback state={state} />

            <div className="flex flex-wrap gap-2.5">
              <SubmitButton
                name="decision"
                value="cleared"
                variant="primary"
                icon={<Check className="h-3.5 w-3.5" />}
              >
                Uniform Approved
              </SubmitButton>
              <SubmitButton
                name="decision"
                value="flagged"
                variant="danger"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
              >
                Record Breach
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}

function Verdict({ item }: { item: ReviewItem }) {
  const check = item.dressCheck;

  if (!check || check.status === "queued" || check.status === "running") {
    return (
      <p className="text-xs text-muted">
        AI analysis in progress. Should settle in a few seconds.
      </p>
    );
  }

  if (check.status === "failed") {
    return (
      <p className="text-xs text-muted">
        AI could not evaluate photo. Please judge manually from the image.
      </p>
    );
  }

  const tone: Tone = check.verdict === "fail" ? "danger" : "warning";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone} className="font-mono font-bold">
          <ShieldAlert className="h-3 w-3 inline mr-1" />
          {check.score !== null ? `${check.score}/100 Score` : (check.verdict ?? "Review")}
        </Pill>
        {check.reason && (
          <span className="text-xs text-muted text-pretty">{check.reason}</span>
        )}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {ITEM_KEYS.map((key) => {
          const grade = (check.items?.[key] ?? "?") as ItemGrade;
          return (
            <li key={key}>
              <Pill tone={gradeTone(grade)} className="text-[11px]">
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
