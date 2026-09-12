import type { ReactNode } from "react";

import { DEFAULT_TIMEZONE, formatLocalTime } from "@/lib/time";

/**
 * The core design shapes every screen is built from.
 *
 * Presentational, server-compatible primitives. Flat surfaces, hairline
 * borders, mono for anything numeric -- see the notes at the top of
 * `globals.css` for why there is no glass or glow in here.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Background, text, and hairline border trio for each tone */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border-border",
  accent: "bg-accent-soft text-accent border-accent/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`pill ${TONE_CLASSES[tone]} ${className}`}>{children}</span>
  );
}

/** A filled dot with an optional pulse, for at-a-glance status */
export function Dot({
  tone = "neutral",
  pulse = false,
}: {
  tone?: Tone;
  pulse?: boolean;
}) {
  const colour: Record<Tone, string> = {
    neutral: "bg-faint",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };

  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colour[tone]}`}
        />
      )}
      <span
        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colour[tone]}`}
      />
    </span>
  );
}

export function Card({
  children,
  className = "",
  hoverable = false,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  return (
    <div className={`card ${hoverable ? "card-hover" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="overline mb-2">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted text-pretty">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted text-pretty">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
  icon,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-surface-sunken px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-4 grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-surface text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </p>
      {body && (
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted text-pretty">
          {body}
        </p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** A labelled form control. `hint` sits under the input in small grey */
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
      {hint && (
        <span className="mt-1.5 block text-[11px] text-faint text-pretty">
          {hint}
        </span>
      )}
    </label>
  );
}

/** A single headline number, for the console overview and personal stats */
export function Stat({
  label,
  value,
  detail,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const valueTone: Record<Tone, string> = {
    neutral: "text-foreground",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };

  const iconTone: Record<Tone, string> = {
    neutral: "text-faint",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="label mb-0">{label}</p>
        {icon && <span className={iconTone[tone]}>{icon}</span>}
      </div>
      <p
        className={`mt-3 font-mono text-2xl tnum font-medium tracking-[-0.02em] ${valueTone[tone]}`}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted text-pretty">
          {detail}
        </p>
      )}
    </Card>
  );
}

/**
 * A punch time, rendered in the cart's zone rather than the viewer's.
 *
 * `suppressHydrationWarning` is belt-and-braces: `formatLocalTime` pins the
 * zone so the server and the browser already agree, and the `title` keeps the
 * exact ISO instant one hover away.
 */
export function LocalTime({
  at,
  timeZone = DEFAULT_TIMEZONE,
}: {
  at: string;
  timeZone?: string;
}) {
  return (
    <time
      dateTime={at}
      suppressHydrationWarning
      title={at}
      className="font-mono text-xs tnum"
    >
      {formatLocalTime(at, { timeZone })}
    </time>
  );
}
