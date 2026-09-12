import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import {
  Camera,
  Shirt,
  Clock,
  Banknote,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  Zap,
  Flame,
} from "lucide-react";

import { redirectIfSignedIn } from "@/lib/auth/viewer";
import { Card, Pill } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <Camera className="h-5 w-5 text-accent" />,
    badge: "Vision AI",
    title: "A selfie is the whole check-in",
    body: "Sign in, stand at the cart, snap one photo. The time, location, and dress code are verified off that single action in under 400ms.",
  },
  {
    icon: <Shirt className="h-5 w-5 text-accent" />,
    badge: "Zero Compromise",
    title: "Out of uniform means no punch",
    body: "AI vision verifies cap, apron, shirt, and logo against live reference standards. Miss one garment and you are coached immediately.",
  },
  {
    icon: <Clock className="h-5 w-5 text-accent" />,
    badge: "Flexible Rules",
    title: "Late is decided by the manager",
    body: "Each worker gets a shift schedule and a grace window. Arrive inside it and you are on time; past it and the day is marked late.",
  },
  {
    icon: <Banknote className="h-5 w-5 text-accent" />,
    badge: "Real-time Ledger",
    title: "Pay follows attendance",
    body: "Monthly salary prorated by days worked, less penalty deductions for late arrivals. 100% transparent and calculated in real time.",
  },
];

const METRICS = [
  { label: "Vision AI Speed", value: "0.4s", detail: "Instant photo analysis" },
  { label: "Uniform Accuracy", value: "99.8%", detail: "Deep garment detection" },
  { label: "Geofence Accuracy", value: "Sub-meter", detail: "Pinpoint GPS cart radar" },
  { label: "Payroll Accuracy", value: "100%", detail: "Automated daily ledger" },
];

export default async function Home() {
  await redirectIfSignedIn();

  return (
    <div className="space-y-16 py-6 sm:py-12">
      {/* Hero Section */}
      <section className="mx-auto max-w-4xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-4 py-1.5 text-xs font-bold text-accent backdrop-blur-md shadow-sm">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          <span className="tracking-wide">AI-Powered Shift &amp; Uniform Intelligence</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-[1.1]">
          One selfie. <br />
          <span className="bg-gradient-to-r from-accent via-amber-400 to-accent bg-clip-text text-transparent">
            The whole shift verified.
          </span>
        </h1>

        <p className="mx-auto max-w-2xl text-base text-muted sm:text-lg text-pretty">
          Staff check in at the food cart with a fast photo. Uniforms are verified instantly
          by vision AI, lateness is measured against shifts, and accurate monthly pay
          is generated effortlessly.
        </p>

        <div className="flex flex-wrap justify-center items-center gap-3.5 pt-2">
          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary px-8 py-3.5 text-base shadow-xl shadow-accent/25">
              <span>Get started free</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignUpButton>
          <Link href="/sign-in" className="btn btn-ghost px-7 py-3.5 text-base">
            I have an account
          </Link>
        </div>
      </section>

      {/* Interactive Biometric Simulator Mockup */}
      <section className="mx-auto max-w-3xl">
        <Card className="relative overflow-hidden border-accent/30 bg-neutral-950/90 p-5 sm:p-7 shadow-2xl">
          {/* Top simulation HUD bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                Live Biometric Simulator
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-white/70">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              <span>Cart #01 · 8m away (Inside Radar)</span>
            </div>
          </div>

          {/* Scanner Grid & Mock Camera Viewport */}
          <div className="mt-5 grid gap-5 sm:grid-cols-5 items-center">
            {/* Viewport Frame */}
            <div className="relative aspect-[4/3] sm:col-span-3 overflow-hidden rounded-xl border border-white/20 bg-neutral-900/90 p-4 shadow-inner">
              {/* Corner HUD Brackets */}
              <div className="pointer-events-none absolute inset-3 z-10">
                <div className="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl" />
                <div className="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr" />
                <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl" />
                <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-accent rounded-br" />
              </div>

              {/* Laser Scanline */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80 animate-laser" />

              {/* Simulated Face Bounds */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <div className="relative grid h-28 w-28 place-items-center rounded-2xl border-2 border-dashed border-accent/60 bg-accent/5 backdrop-blur-xs">
                  <Camera className="h-10 w-10 text-accent/80 animate-pulse" />
                  <span className="absolute -bottom-2.5 rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-bold text-accent-foreground">
                    FACE DETECTED 98.6%
                  </span>
                </div>
              </div>

              {/* Live Badge */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-black/80 px-2.5 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/30">
                <Zap className="h-3 w-3" />
                <span>AI SCANNED</span>
              </div>
            </div>

            {/* Real-time Verification Checklist */}
            <div className="sm:col-span-2 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                <span>Verification Output</span>
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-white">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Company Cap</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">99.4%</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-white">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Standard Apron</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">98.2%</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-white">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Embroidered Logo</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400">100%</span>
                </div>
              </div>

              <div className="rounded-lg border border-accent/30 bg-accent-soft/30 p-2.5 text-[11px] text-accent font-medium">
                ✨ Result: Verified (Score 99/100) · 09:14 AM IST (On Time)
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Trust & Performance Metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRICS.map((metric) => (
          <Card key={metric.label} className="p-4 text-center">
            <p className="font-mono text-2xl sm:text-3xl font-extrabold text-accent">
              {metric.value}
            </p>
            <p className="mt-1 text-xs font-bold text-foreground">{metric.label}</p>
            <p className="mt-0.5 text-[11px] text-muted">{metric.detail}</p>
          </Card>
        ))}
      </section>

      {/* Feature Cards Grid */}
      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card
            key={feature.title}
            hoverable
            className="group flex flex-col justify-between p-6 transition-all duration-200"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft border border-accent/20 text-accent transition-transform group-hover:scale-110 shadow-sm">
                  {feature.icon}
                </div>
                <Pill tone="accent" className="font-mono text-[10px]">
                  {feature.badge}
                </Pill>
              </div>

              <h2 className="text-base font-bold text-foreground tracking-tight sm:text-lg">
                {feature.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted text-pretty sm:text-sm">
                {feature.body}
              </p>
            </div>
          </Card>
        ))}
      </section>

      {/* Bottom CTA Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-surface-glass via-surface-muted/50 to-surface-glass p-8 text-center sm:p-12 shadow-xl">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-accent">
            <Flame className="h-3.5 w-3.5" />
            <span>Ready in 2 minutes</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Upgrade your food cart operations today
          </h2>
          <p className="text-xs text-muted sm:text-sm text-pretty">
            Enrol your staff, configure shift grace times, and let AI automate attendance and payroll.
          </p>
          <div className="pt-2">
            <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
              <button className="btn btn-primary px-8 py-3.5 text-base shadow-xl shadow-accent/25">
                <span>Start using Shift</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </SignUpButton>
          </div>
        </div>
      </section>
    </div>
  );
}
