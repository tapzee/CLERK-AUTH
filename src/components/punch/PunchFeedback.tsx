import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { ITEM_KEYS, ITEM_NOUNS, type ItemGrade } from "@/lib/uniform/items";
import { Pill } from "@/components/ui/primitives";

import type { Phase } from "./phase";

/**
 * Everything the screen says back after a punch was attempted.
 */

/**
 * Why a check-in was refused, item by item.
 *
 * Naming the garments matters: "not in uniform" leaves somebody guessing, and a
 * worker guessing at a cart just takes the same photo again. Nothing was
 * recorded when this shows — the attempt is filed, but the punch is not.
 */
export function RejectionNotice({ phase }: { phase: Extract<Phase, { kind: "rejected" }> }) {
  const problems = ITEM_KEYS.map((key) => ({
    key,
    grade: (phase.grades?.[key] ?? "?") as ItemGrade,
  })).filter((item) => item.grade === "n" || item.grade === "p");

  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
      <div className="flex items-center gap-2 text-danger font-semibold text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>{phase.message}</span>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {problems.map((item) => (
            <li key={item.key}>
              <Pill tone="danger">
                {item.grade === "n"
                  ? `Missing ${ITEM_NOUNS[item.key]}`
                  : `${ITEM_NOUNS[item.key]} not worn correctly`}
              </Pill>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-danger/80 text-pretty">
        Adjust your uniform and retake or upload a new photo to complete your check-in.
      </p>
    </div>
  );
}

/** A failure the worker can act on — a dead camera, a refused upload, no network. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-xs font-medium text-danger"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/** The punch landed. A warning tone still means it was recorded — just late. */
export function DoneBanner({
  message,
  tone,
}: {
  message: string;
  tone: "success" | "warning";
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl p-4 text-xs font-medium ${
        tone === "success"
          ? "border border-success/30 bg-success-soft text-success"
          : "border border-warning/30 bg-warning-soft text-warning"
      }`}
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
