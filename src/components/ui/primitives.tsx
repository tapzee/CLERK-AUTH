import type { ReactNode } from "react";

import { DEFAULT_TIMEZONE, formatLocalTime } from "@/lib/time";

/**
 * The core design shapes every screen is built from.
 *
 * Presentational, server-compatible primitives styled with glassmorphism,
 * hardware acceleration, and crisp micro-typography.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Background, text, and delicate border pairs for each tone */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border-border/50",
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
    <span className={`pill ${TONE_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** A filled dot with an optional subtle pulse, for at-a-glance status */
export function Dot({
  tone = "neutral",
  pulse = false,
}: {
  tone?: Tone;
  pulse?: boolean;
}) {
  const colour: Record<Tone, string> = {
    neutral: "bg-muted",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };

  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${colour[tone]}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colour[tone]}`} />
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
    <div className={`card gpu-layer ${hoverable ? "card-hover" : ""} ${className}`}>
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
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent backdrop-blur-md mb-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span>{eyebrow}</span>
          </div>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs text-muted sm:text-sm text-pretty">{description}</p>
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
        <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted text-pretty">{description}</p>}
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
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface-glass/40 px-6 py-12 text-center backdrop-blur-md">
      {icon && (
        <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft border border-accent/15 text-accent shadow-sm">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-foreground">{title}</p>
      {body && (
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted text-pretty">{body}</p>
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
      {hint && <span className="mt-1.5 block text-[11px] text-muted text-pretty">{hint}</span>}
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

  const bgGlow: Record<Tone, string> = {
    neutral: "hover:border-border",
    accent: "hover:border-accent/40 hover:shadow-accent/10",
    success: "hover:border-success/40 hover:shadow-success/10",
    warning: "hover:border-warning/40 hover:shadow-warning/10",
    danger: "hover:border-danger/40 hover:shadow-danger/10",
  };

  const iconBg: Record<Tone, string> = {
    neutral: "bg-surface-muted text-muted",
    accent: "bg-accent-soft text-accent border border-accent/20",
    success: "bg-success-soft text-success border border-success/20",
    warning: "bg-warning-soft text-warning border border-warning/20",
    danger: "bg-danger-soft text-danger border border-danger/20",
  };

  return (
    <Card className={`p-4 sm:p-5 transition-all duration-200 hover:shadow-lg ${bgGlow[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label mb-0">{label}</p>
        {icon && (
          <div className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-semibold ${iconBg[tone]}`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${valueTone[tone]}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted text-pretty">{detail}</p>}
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
      className="font-mono text-xs tabular-nums"
    >
      {formatLocalTime(at, { timeZone })}
    </time>
  );
}
