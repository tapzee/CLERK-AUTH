import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Camera, Shirt, Clock, Banknote, ArrowRight, Sparkles } from "lucide-react";

import { redirectIfSignedIn } from "@/lib/auth/viewer";
import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <Camera className="h-5 w-5 text-accent" />,
    title: "A selfie is the whole check-in",
    body: "Sign in, stand at the cart, take one photo. The time, the place and the uniform are all verified off that single action.",
  },
  {
    icon: <Shirt className="h-5 w-5 text-accent" />,
    title: "Out of uniform means no punch",
    body: "The photo is checked for a cap, apron, shirt and logo before anything is recorded. Miss one and you are told which immediately.",
  },
  {
    icon: <Clock className="h-5 w-5 text-accent" />,
    title: "Late is decided by the manager",
    body: "Each worker gets a shift time and a grace window. Arrive inside it and you are on time; past it and the day is marked late.",
  },
  {
    icon: <Banknote className="h-5 w-5 text-accent" />,
    title: "Pay follows attendance",
    body: "A monthly salary prorated by days actually worked, less deductions for late arrivals. Transparent and calculated in real time.",
  },
];

export default async function Home() {
  await redirectIfSignedIn();

  return (
    <div className="space-y-16 py-6 sm:py-12">
      <section className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI-Powered Shift &amp; Uniform Intelligence</span>
        </div>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-[1.1]">
          One selfie. <br />
          <span className="bg-gradient-to-r from-accent via-amber-500 to-accent bg-clip-text text-transparent">
            The whole shift verified.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
          Staff check in at the cart with a fast photo. Uniforms are verified instantly
          by vision AI, lateness is measured against shifts, and accurate monthly pay
          is generated effortlessly.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3.5">
          <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
            <button className="btn btn-primary px-7 py-3 text-base shadow-lg shadow-accent/20">
              <span>Get started</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignUpButton>
          <Link href="/sign-in" className="btn btn-ghost px-6 py-3 text-base">
            I have an account
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card
            key={feature.title}
            hoverable
            className="group flex flex-col justify-between p-6 transition-all duration-200"
          >
            <div>
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent-soft border border-accent/15 transition-transform group-hover:scale-110">
                {feature.icon}
              </div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                {feature.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted text-pretty sm:text-sm">
                {feature.body}
              </p>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
