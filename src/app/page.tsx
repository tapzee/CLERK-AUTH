import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

const features = [
  {
    title: "Blink to capture",
    body: "Hold your eyes shut for a moment and the shutter fires on its own. Face detection runs on your device — no frame is uploaded for it.",
  },
  {
    title: "Tagged with where you were",
    body: "Each photo records the device's coordinates and how accurate that fix was, so you always know whether it was GPS or a rough guess.",
  },
  {
    title: "Private by default",
    body: "The bucket refuses unsigned reads. Photos are served over signed URLs that expire, and the storage key never reaches the browser.",
  },
];

export default function Home() {
  return (
    <div className="space-y-20 py-8">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Camera · Location · Private storage
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Capture a moment, keep it private.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base/7 text-muted text-pretty">
          Sign in, take a photo straight from your camera, and it lands in a private
          bucket that only you can read.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Show when="signed-in">
            <Link
              href="/camera"
              className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Open the camera
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-border px-6 py-3 text-sm font-medium transition hover:bg-surface-muted"
            >
              View gallery
            </Link>
          </Show>

          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition hover:opacity-90">
                Get started
              </button>
            </SignUpButton>
            <Link
              href="/sign-in"
              className="rounded-full border border-border px-6 py-3 text-sm font-medium transition hover:bg-surface-muted"
            >
              I have an account
            </Link>
          </Show>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <h2 className="text-sm font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm/6 text-muted text-pretty">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
