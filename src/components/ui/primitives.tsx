import type { ReactNode } from "react";

/**
 * The handful of shapes every screen is built from.
 *
 * Presentational only -- no state, no client directive -- so these render on
 * the server and can be dropped into any page. Anything that needs an event
 * handler lives in its own client component next to this file.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Background/foreground pairs for each tone, as `pill` expects them. */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`pill ${TONE_CLASSES[tone]}`}>{children}</span>;
}

/** A filled dot, for a status that needs a glance rather than a word. */
export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colour: Record<Tone, string> = {
    neutral: "bg-muted",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${colour[tone]}`} />;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted text-pretty">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted text-pretty">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** A labelled form control. `hint` sits under the input, in small grey. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted text-pretty">{hint}</span>}
    </label>
  );
}

/** A single headline number, for the console overview. */
export function Stat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
}) {
  const valueTone: Record<Tone, string> = {
    neutral: "text-foreground",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <Card className="p-4">
      <p className="label mb-0">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueTone[tone]}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted text-pretty">{detail}</p>}
    </Card>
  );
}

/**
 * A time, rendered in whoever is looking at it.
 *
 * The server renders its own zone and the browser re-renders the viewer's, so
 * the mismatch is suppressed rather than forcing everybody onto UTC -- local
 * wall-clock time is the only reading that means anything for a shift.
 */
export function LocalTime({ at }: { at: string }) {
  return (
    <time dateTime={at} suppressHydrationWarning className="tabular-nums">
      {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}
