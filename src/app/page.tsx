import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Check, MapPin } from "lucide-react";

import { redirectIfSignedIn } from "@/lib/auth/viewer";
import { Pill } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  {
    title: "One selfie is the whole check-in",
    body: "Staff open the camera at the cart and take a single photo. The time, the GPS fix and the uniform are all checked from that one frame.",
  },
  {
    title: "Uniform standards, enforced the same way every day",
    body: "Vision AI compares cap, apron, shirt and logo placement against your reference photos and scores the result. Staff see what is missing straight away.",
  },
  {
    title: "A shift and a grace window per person",
    body: "Assign working hours and a grace period to each staff member. Managers keep flexible hours without automatic deductions against them.",
  },
  {
    title: "Payroll that shows its arithmetic",
    body: "Monthly pay is derived from days present and late minutes, line by line, so there is nothing to reconcile at the end of the month.",
  },
];

const STEPS = [
  {
    title: "Enrol",
    body: "Add staff by the Google address they already use and assign them to a cart.",
  },
  {
    title: "Punch",
    body: "They check in and out from their own phone, standing at the cart.",
  },
  {
    title: "Approve",
    body: "Review anything the uniform check flagged, then sign off the month.",
  },
];

/** A label-and-value row from the sample punch record. */
function RecordRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 sm:py-2.5">
      <span className="text-[13px] text-muted sm:text-xs">{label}</span>
      <span className="flex items-center gap-2 font-mono text-[13px] tnum text-foreground sm:text-xs">
        {children}
      </span>
    </div>
  );
}

export default async function Home() {
  await redirectIfSignedIn();

  return (
    <div className="space-y-14 sm:space-y-28">
      {/* ------------------------------------------------------------- hero */}
      <section className="animate-rise max-w-3xl">
        <p className="overline">Attendance &amp; payroll for food carts</p>

        <h1 className="display-xl mt-5 text-foreground text-balance">
          Attendance you can see, payroll you can{" "}
          <em className="italic">prove</em>.
        </h1>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:mt-6 sm:text-base">
          Shift turns one staff selfie into a verified check-in — time, location
          and full uniform compliance — then works the month&rsquo;s salary out
          from what actually happened.
        </p>

        <div className="mt-7 flex gap-2.5 sm:mt-8 sm:flex-wrap sm:items-center">
          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary flex-1 sm:flex-none sm:px-5 sm:py-2.5">
              <span>Get started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </SignUpButton>
          <Link
            href="/sign-in"
            className="btn btn-ghost flex-1 sm:flex-none sm:px-5 sm:py-2.5"
          >
            Sign in
          </Link>
        </div>

        {/* A wrapping list rather than one string: each separator travels
            with the item it precedes, so no line ends on a stray dot. */}
        <ul className="mt-6 flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs text-faint sm:text-[11px]">
          {["Google sign-in", "nothing to install", "works on any phone"].map(
            (item, index) => (
              <li key={item} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden>·</span>}
                {item}
              </li>
            ),
          )}
        </ul>
      </section>

      {/* --------------------------------------------- sample punch record */}
      <section>
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken px-4 py-2.5 sm:px-5">
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted sm:text-[11px]">
              Punch record
            </span>
            <span className="font-mono text-xs tnum text-faint sm:text-[11px]">
              12 Sep · Cart 01 · 09:14 IST
            </span>
          </div>

          <div className="grid md:grid-cols-2 md:divide-x md:divide-border">
            {/* The worker and the money */}
            <div className="p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    Aarav Sharma
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted sm:text-xs">
                    <MapPin className="h-3 w-3 shrink-0" />
                    Connaught Place · Cart 01
                  </p>
                </div>
                <Pill>staff</Pill>
              </div>

              <div className="mt-5 divide-y divide-border border-t border-border">
                <RecordRow label="Assigned shift">09:00 – 18:00</RecordRow>
                <RecordRow label="Checked in">
                  09:14
                  <Pill tone="success">on time</Pill>
                </RecordRow>
                <RecordRow label="Distance from cart">8 m</RecordRow>
                <RecordRow label="Base salary">₹22,000 / 26 days</RecordRow>
              </div>

              {/* The total line, weighted like one on an invoice. */}
              <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-foreground/20 pt-3.5">
                <span className="text-sm font-medium text-foreground sm:text-[13px]">
                  Pay for the day
                </span>
                <span className="font-mono text-base tnum text-accent">
                  ₹846.15
                </span>
              </div>
            </div>

            {/* What the vision check returned */}
            <div className="border-t border-border p-5 sm:p-6 md:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  Uniform check
                </p>
                <Pill tone="success">98/100 pass</Pill>
              </div>

              <ul className="mt-5 divide-y divide-border border-t border-border">
                {["Navy cap", "Cart apron, logo visible", "Collar polo shirt"].map(
                  (item) => (
                    <li
                      key={item}
                      className="flex items-center justify-between gap-3 py-3 sm:py-2.5"
                    >
                      <span className="flex items-center gap-2 text-[13px] text-foreground sm:text-xs">
                        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                        {item}
                      </span>
                      <span className="font-mono text-xs text-muted sm:text-[11px]">
                        verified
                      </span>
                    </li>
                  ),
                )}
              </ul>

              <p className="mt-4 text-[13px] leading-relaxed text-faint sm:text-xs">
                Stored encrypted, served only over a short-lived signed URL.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- capabilities */}
      <section>
        <div className="max-w-xl">
          <p className="overline">What it does</p>
          <h2 className="display-lg mt-3 text-foreground text-balance">
            Four things, done thoroughly.
          </h2>
        </div>

        <div className="mt-8 grid border-t border-border sm:mt-10 sm:grid-cols-2 sm:gap-x-12">
          {CAPABILITIES.map((capability, index) => (
            <div
              key={capability.title}
              className="border-b border-border py-5 sm:py-7"
            >
              <p className="font-mono text-xs tnum text-accent sm:text-[11px]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                {capability.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted sm:text-[13px]">
                {capability.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ steps */}
      <section>
        <div className="max-w-xl">
          <p className="overline">Getting running</p>
          <h2 className="display-lg mt-3 text-foreground text-balance">
            Three steps, then it runs itself.
          </h2>
        </div>

        <ol className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-foreground/15 pt-4">
              <p className="font-mono text-xs tnum text-faint sm:text-[11px]">
                Step {index + 1}
              </p>
              <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-[13px]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section className="border-t border-border pt-10 sm:pt-16">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md">
            <h2 className="display-lg text-foreground text-balance">
              Start with one cart.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Enrol your staff with the Google account they already have, set
              their shifts, and let the camera keep the register from tomorrow
              morning.
            </p>
          </div>

          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary w-full shrink-0 sm:w-auto sm:px-5 sm:py-2.5">
              <span>Create your account</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </SignUpButton>
        </div>
      </section>
    </div>
  );
}
