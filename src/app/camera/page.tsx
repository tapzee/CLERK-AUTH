import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { CameraCapture } from "@/components/CameraCapture";

export const metadata = { title: "Camera · Live Photos" };

export default async function CameraPage() {
  // Checked here rather than in proxy.ts, so protection travels with the page.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Take a live photo</h1>
          <p className="mt-1 max-w-xl text-sm text-muted text-pretty">
            The frame is captured in your browser and uploaded through an authenticated
            route — the storage key never reaches the client.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-full border border-border px-5 py-2.5 text-sm transition hover:bg-surface-muted"
        >
          Gallery
        </Link>
      </header>

      <CameraCapture />
    </section>
  );
}
