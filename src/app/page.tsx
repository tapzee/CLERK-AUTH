import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import {
  Camera,
  Shirt,
  Clock,
  Banknote,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Check,
  Sparkles,
  Users,
} from "lucide-react";

import { redirectIfSignedIn } from "@/lib/auth/viewer";
import { Card, Pill } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <Camera className="h-5 w-5 text-accent" />,
    badge: "Vision Verification",
    title: "One selfie is the whole check-in",
    body: "Staff sign in, stand at the cart, and snap a single photo. Time, GPS location, and full uniform compliance are verified in under half a second.",
  },
  {
    icon: <Shirt className="h-5 w-5 text-accent" />,
    badge: "Standard Compliance",
    title: "Enforce uniform standards effortlessly",
    body: "Vision AI inspects caps, aprons, shirts, and logo placement against your reference standard. Staff get instant feedback if an item is missing.",
  },
  {
    icon: <Clock className="h-5 w-5 text-accent" />,
    badge: "Shift Intelligence",
    title: "Flexible shifts & custom grace windows",
    body: "Assign custom shifts and grace periods for staff. Managers enjoy flexible working hours without automated deductions.",
  },
  {
    icon: <Banknote className="h-5 w-5 text-accent" />,
    badge: "Transparent Payroll",
    title: "Attendance-driven payroll ledger",
    body: "Monthly compensation calculated automatically from days worked and lateness penalties. Transparent, dispute-free arithmetic.",
  },
];

export default async function Home() {
  await redirectIfSignedIn();

  return (
    <div className="space-y-20 py-8 sm:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-3xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/70 px-3.5 py-1 text-xs font-medium text-muted backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="text-foreground/90 font-medium">Smart Food Cart Attendance &amp; Payroll</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-[1.12]">
          Attendance verified by photo. <br />
          <span className="bg-gradient-to-r from-amber-400 via-accent to-amber-500 bg-clip-text text-transparent">
            Payroll calculated in real time.
          </span>
        </h1>

        <p className="mx-auto max-w-xl text-base text-muted sm:text-lg text-pretty leading-relaxed">
          Shift replaces paper registers with fast selfie check-ins, automated AI uniform
          audits, and exact payroll arithmetic for modern street food chains.
        </p>

        <div className="flex flex-wrap justify-center items-center gap-3 pt-2">
          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary px-7 py-3 text-sm sm:text-base shadow-lg shadow-accent/20">
              <span>Get started</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignUpButton>
          <Link href="/sign-in" className="btn btn-ghost px-6 py-3 text-sm sm:text-base">
            Sign in to portal
          </Link>
        </div>
      </section>

      {/* Realistic, Minimalist App Preview Card */}
      <section className="mx-auto max-w-4xl">
        <div className="relative rounded-2xl border border-border/80 bg-surface-glass/90 p-1.5 shadow-2xl backdrop-blur-xl">
          {/* Mock Window Chrome */}
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-mono text-[11px] text-muted">shift.app/punch · Cart #01</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Geofence Connected (8m)</span>
            </div>
          </div>

          {/* Product UI Simulation */}
          <div className="p-4 sm:p-6 grid gap-6 md:grid-cols-12 items-center">
            {/* Left: Worker Punch Record */}
            <div className="md:col-span-6 space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-bold text-accent border border-accent/20">
                  AS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-foreground text-sm">Aarav Sharma</p>
                    <Pill tone="accent" className="text-[10px]">Staff</Pill>
                  </div>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-accent" />
                    <span>Connaught Place Cart #01</span>
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-surface-muted/30 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center text-muted">
                  <span>Assigned Shift</span>
                  <span className="font-mono text-foreground font-semibold">09:00 AM – 06:00 PM</span>
                </div>
                <div className="flex justify-between items-center text-muted">
                  <span>Check-in Recorded</span>
                  <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1">
                    <span>09:14 AM IST</span>
                    <Pill tone="success" className="text-[10px]">On time (+14m)</Pill>
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted">
                  <span>Base Compensation</span>
                  <span className="font-mono text-foreground font-semibold">₹22,000 / 26 days</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-accent/25 bg-accent-soft/30 px-3.5 py-2.5 text-xs text-accent">
                <span className="font-semibold">Calculated Day Pay:</span>
                <span className="font-mono font-bold text-sm">₹846.15</span>
              </div>
            </div>

            {/* Right: AI Uniform Verification Checklist */}
            <div className="md:col-span-6 rounded-xl border border-border/70 bg-surface/40 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span>Uniform Verification Result</span>
                </div>
                <Pill tone="success" className="font-mono text-[10px]">
                  Score 98/100 · Pass
                </Pill>
              </div>

              <ul className="space-y-2 text-xs">
                <li className="flex items-center justify-between rounded-lg bg-surface-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Standard Navy Cap</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">Verified</span>
                </li>

                <li className="flex items-center justify-between rounded-lg bg-surface-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Embroidered Cart Apron</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">Verified</span>
                </li>

                <li className="flex items-center justify-between rounded-lg bg-surface-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Collar Polo Shirt</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">Verified</span>
                </li>
              </ul>

              <p className="text-[11px] text-muted text-pretty">
                ✓ Photo archived securely with encrypted signed URLs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="mx-auto max-w-4xl space-y-6">
        <div className="text-center space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Capabilities</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Everything your food cart chain needs
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              hoverable
              className="p-6 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent border border-accent/20">
                    {feature.icon}
                  </div>
                  <span className="font-mono text-[11px] text-muted font-medium">
                    {feature.badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted text-pretty sm:text-sm">
                  {feature.body}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Minimal Call to Action */}
      <section className="mx-auto max-w-3xl rounded-2xl border border-border/80 bg-surface-glass p-8 sm:p-12 text-center shadow-lg backdrop-blur-md space-y-4">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Simplify your team operations today
        </h2>
        <p className="mx-auto max-w-md text-xs text-muted sm:text-sm text-pretty">
          Enrol staff in seconds with their Google account, set shifts, and let vision AI handle daily attendance.
        </p>
        <div className="pt-2">
          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary px-7 py-3 text-sm sm:text-base shadow-lg shadow-accent/20">
              <span>Create your account</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignUpButton>
        </div>
      </section>
    </div>
  );
}
