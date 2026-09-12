"use client";

import { useState } from "react";
import { SignIn } from "@clerk/nextjs";
import {
  Shield,
  Store,
  Camera,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

type RoleOption = "admin" | "manager" | "staff";

const ROLES_INFO: Record<
  RoleOption,
  {
    label: string;
    badge: string;
    icon: typeof Shield;
    tagline: string;
    description: string;
    instructions: string;
    capabilities: string[];
  }
> = {
  admin: {
    label: "Owner / Admin",
    badge: "Full Access",
    icon: Shield,
    tagline: "Executive & Financial Oversight",
    description: "Full administrative access across all food carts, payroll approvals, and team management.",
    instructions: "Sign in with your configured Owner account (e.g. tapzee.in@gmail.com).",
    capabilities: [
      "Approve & sign off monthly payroll runs",
      "Assign roles & manage all food carts",
      "Define uniform scoring & AI reference photos",
      "Comprehensive attendance & lateness analytics",
    ],
  },
  manager: {
    label: "Manager",
    badge: "Cart Console",
    icon: Store,
    tagline: "Cart Operations & Team Roster",
    description: "Manage your assigned cart, monitor daily attendance, and review uniform selfies.",
    instructions: "Sign in with the Google email assigned to your cart by an owner.",
    capabilities: [
      "Live daily attendance & lateness monitoring",
      "Uniform photo review queue for manual checks",
      "Manage cart staff roster & shift grace times",
      "Calculate & prepare monthly payroll for approval",
    ],
  },
  staff: {
    label: "Staff Member",
    badge: "Worker Check-in",
    icon: Camera,
    tagline: "Selfie Punch & Attendance Logs",
    description: "Check in and check out at the food cart with instant AI uniform verification.",
    instructions: "Sign in with the email address your manager enrolled on the roster.",
    capabilities: [
      "One-click selfie check-in at the cart",
      "Instant Vision AI cap, apron & shirt verification",
      "Hands-free blink-to-capture shutter option",
      "Transparent salary breakdown & monthly payslips",
    ],
  },
};

export function RoleSignInView() {
  const [selectedRole, setSelectedRole] = useState<RoleOption>("admin");
  const current = ROLES_INFO[selectedRole];
  const IconComponent = current.icon;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 py-4 sm:py-8">
      {/* Top Role Selector Tabs */}
      <div className="text-center space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
          Role-Based Access
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Choose Your Portal
        </h1>
        <p className="text-xs text-muted max-w-md mx-auto sm:text-sm">
          Select your role below to view access guidelines and sign into the Shift platform.
        </p>
      </div>

      {/* Role Selection Grid / Tabs */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLES_INFO) as RoleOption[]).map((role) => {
          const info = ROLES_INFO[role];
          const RoleIcon = info.icon;
          const isSelected = selectedRole === role;

          return (
            <button
              key={role}
              type="button"
              onClick={() => setSelectedRole(role)}
              className={`
                group relative flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer
                ${
                  isSelected
                    ? "border-accent bg-accent-soft/50 shadow-md shadow-accent/10 ring-1 ring-accent/30"
                    : "border-border/80 bg-surface-glass hover:bg-surface-muted/50 hover:border-border"
                }
              `}
            >
              <div className="flex w-full items-center justify-between mb-2.5">
                <div
                  className={`grid h-8 w-8 place-items-center rounded-xl transition-transform group-hover:scale-105 ${
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  <RoleIcon className="h-4 w-4" />
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isSelected
                      ? "bg-accent/20 text-accent font-mono"
                      : "bg-surface-muted text-muted font-mono"
                  }`}
                >
                  {info.badge}
                </span>
              </div>

              <p className="font-bold text-sm text-foreground tracking-tight">
                {info.label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted line-clamp-2">
                {info.tagline}
              </p>

              {isSelected && (
                <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-accent">
                  <span>Selected</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Split layout: Role Info Card + Clerk SignIn Widget */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_minmax(0,1fr)] items-start">
        {/* Left: Role Details & Guidance */}
        <div className="rounded-2xl border border-border/80 bg-surface-glass p-5 sm:p-6 backdrop-blur-xl shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-foreground sm:text-lg">
                  Signing in as {current.label}
                </h2>
              </div>
              <p className="text-xs text-muted">{current.tagline}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-foreground font-semibold uppercase tracking-wider">
              Portal Features:
            </p>
            <ul className="space-y-2">
              {current.capabilities.map((cap) => (
                <li key={cap} className="flex items-start gap-2 text-xs text-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-accent/20 bg-accent-soft/40 p-3.5 text-xs text-accent">
            <p className="font-semibold mb-0.5">Authentication Note:</p>
            <p className="text-foreground/80">{current.instructions}</p>
          </div>
        </div>

        {/* Right: Clerk Sign-In Form */}
        <div className="flex justify-center w-full">
          <SignIn
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "w-full bg-surface-glass/90 backdrop-blur-xl border border-border shadow-xl rounded-2xl p-4 sm:p-6",
                headerTitle: "text-foreground font-bold tracking-tight text-base sm:text-lg",
                headerSubtitle: "text-muted text-xs",
                formButtonPrimary:
                  "bg-accent hover:bg-accent-hover text-accent-foreground font-semibold text-xs sm:text-sm rounded-full py-2.5 shadow-sm transition-all active:scale-[0.98]",
                formFieldInput:
                  "rounded-xl border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-foreground focus:border-accent focus:ring-1 focus:ring-accent outline-none",
                formFieldLabel: "text-xs font-semibold text-muted mb-1",
                footerActionLink: "text-accent font-semibold hover:underline text-xs",
                dividerLine: "bg-border/60",
                dividerText: "text-muted text-[11px] font-mono",
                socialButtonsBlockButton:
                  "rounded-xl border border-border bg-surface hover:bg-surface-muted text-foreground text-xs sm:text-sm font-medium transition py-2",
                socialButtonsBlockButtonText: "text-foreground font-medium",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
