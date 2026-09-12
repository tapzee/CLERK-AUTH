import type { ReactNode } from "react";

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted text-pretty">{description}</p>
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
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
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
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface-glass/50 px-6 py-12 text-center backdrop-blur-sm">
      {icon && (
        <div className="mx-auto mb-3.5 grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-muted shadow-sm">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
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
      {hint && <span className="mt-1.5 block text-xs text-muted text-pretty">{hint}</span>}
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
    accent: "hover:border-accent/30",
    success: "hover:border-success/30",
    warning: "hover:border-warning/30",
    danger: "hover:border-danger/30",
  };

  return (
    <Card className={`p-4 transition-all duration-200 ${bgGlow[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label mb-0">{label}</p>
        {icon && <span className="text-muted/70">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${valueTone[tone]}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted text-pretty">{detail}</p>}
    </Card>
  );
}

/**
 * A time rendered in the viewer's local timezone.
 */
export function LocalTime({ at }: { at: string }) {
  return (
    <time dateTime={at} suppressHydrationWarning className="font-mono text-xs tabular-nums">
      {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}
