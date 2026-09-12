"use client";

import { useState } from "react";
import { SignIn } from "@clerk/nextjs";
import { Camera, Shield, Store } from "lucide-react";

type RoleOption = "admin" | "manager" | "staff";

const ROLES_INFO: Record<
  RoleOption,
  {
    label: string;
    short: string;
    icon: typeof Shield;
    tagline: string;
    instructions: string;
    capabilities: string[];
  }
> = {
  admin: {
    label: "Owner",
    short: "Owner",
    icon: Shield,
    tagline: "Everything, across every cart",
    instructions:
      "Sign in with the Google account configured as the owner, for example tapzee.in@gmail.com.",
    capabilities: [
      "Sign off the monthly payroll run",
      "Assign roles and manage every cart",
      "Set the uniform reference photos and scoring",
      "Attendance and lateness across the whole chain",
    ],
  },
  manager: {
    label: "Manager",
    short: "Manager",
    icon: Store,
    tagline: "One cart, its roster and its day",
    instructions:
      "Sign in with the Google address an owner assigned to your cart.",
    capabilities: [
      "Today's attendance and lateness, live",
      "Review the uniform photos that were flagged",
      "Manage the cart roster and grace windows",
      "Prepare the month's payroll for approval",
    ],
  },
  staff: {
    label: "Staff",
    short: "Staff",
    icon: Camera,
    tagline: "Check in, check out, see your pay",
    instructions:
      "Sign in with the email address your manager put on the roster.",
    capabilities: [
      "One-photo check-in at the cart",
      "Instant cap, apron and shirt verification",
      "Blink-to-capture if your hands are busy",
      "Your own attendance record and pay breakdown",
    ],
  },
};

const ROLE_ORDER: RoleOption[] = ["admin", "manager", "staff"];

export function RoleSignInView() {
  const [selectedRole, setSelectedRole] = useState<RoleOption>("admin");
  const current = ROLES_INFO[selectedRole];
  const CurrentIcon = current.icon;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="max-w-xl">
        <p className="overline">Sign in</p>
        <h1 className="display-lg mt-3 text-foreground text-balance">
          Three roles, one door.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Pick yours to see what the portal opens onto and which address to use.
          Shift works out your access from the account you sign in with.
        </p>
      </div>

      {/* Segmented role switcher -- a hairline control, not three cards */}
      <div
        role="tablist"
        aria-label="Role"
        className="mt-7 flex w-full rounded-[10px] border border-border bg-surface p-1 sm:mt-8 sm:inline-flex sm:w-auto sm:p-0.5"
      >
        {ROLE_ORDER.map((role) => {
          const info = ROLES_INFO[role];
          const RoleIcon = info.icon;
          const isSelected = selectedRole === role;

          return (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedRole(role)}
              className={`flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] px-2 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none sm:px-3 sm:py-1.5 sm:text-[13px] ${
                isSelected
                  ? "bg-ink text-ink-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <RoleIcon className="h-3.5 w-3.5 shrink-0" />
              {info.short}
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)] lg:gap-12">
        {/* What this role gets */}
        <div>
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <CurrentIcon className="h-4 w-4 shrink-0 text-accent" />
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                Signing in as {current.label}
              </h2>
              <p className="text-xs text-muted">{current.tagline}</p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {current.capabilities.map((capability, index) => (
              <li
                key={capability}
                className="flex items-baseline gap-3 py-3 text-sm text-foreground sm:text-[13px]"
              >
                <span className="font-mono text-xs tnum text-faint sm:text-[11px]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="leading-relaxed">{capability}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-[10px] border border-border bg-surface-sunken p-3.5">
            <p className="label mb-1">Which account</p>
            <p className="text-[13px] leading-relaxed text-muted sm:text-xs">
              {current.instructions}
            </p>
          </div>
        </div>

        {/* Clerk's form, restyled to the same hairline language */}
        <div className="w-full">
          <SignIn
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
            appearance={{ elements: { rootBox: "w-full" } }}
          />
        </div>
      </div>
    </div>
  );
}
