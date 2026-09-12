import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpButton } from "@clerk/nextjs";

import { can } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";
import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "A selfie is the whole check-in",
    body: "Sign in, stand at the cart, take one photo. The time, the place and the uniform are all read off that single action.",
  },
  {
    title: "Out of uniform means no punch",
    body: "The photo is checked for a cap, apron, shirt and logo before anything is recorded. Miss one and you are told which, and asked to try again.",
  },
  {
    title: "Late is decided by the manager",
    body: "Each worker gets a shift time and a grace window. Arrive inside it and you are on time; past it and the day is marked late.",
  },
  {
    title: "Pay follows attendance",
    body: "A monthly salary prorated by the days actually worked, less whatever a late day costs. The manager prepares it, the owner approves it.",
  },
];

/**
 * The signed-out pitch.
 *
 * Anybody already signed in is sent where they actually work rather than being
 * shown marketing copy about the product they are standing in.
 */
export default async function Home() {
  const state = await getViewerState();

  if (state.status === "enrolled") {
    redirect(can(state.viewer.role, "console:read") ? "/manage" : "/punch");
  }
  if (state.status === "not-enrolled") {
    redirect("/punch");
  }

  return (
    <div className="space-y-16 py-8">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Attendance · Uniform · Payroll
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          One selfie, and the shift is on the record.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base/7 text-muted text-pretty">
          Staff check in from the cart with a photo. The uniform is checked before the
          punch counts, lateness is measured against the shift their manager set, and
          the month&rsquo;s pay falls out of the attendance record.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <SignUpButton mode="modal">
            <button className="btn btn-primary px-6 py-3">Get started</button>
          </SignUpButton>
          <Link href="/sign-in" className="btn btn-ghost px-6 py-3">
            I have an account
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card key={feature.title} className="p-5">
            <h2 className="text-sm font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm/6 text-muted text-pretty">{feature.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
