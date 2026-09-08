import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { PhotoGrid } from "@/components/PhotoGrid";
import { listPhotos } from "@/lib/photos";

export const metadata = { title: "Gallery · Live Photos" };

// Signed URLs expire, so this page is always rendered fresh.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [user, photos] = await Promise.all([currentUser(), listPhotos(userId)]);
  const located = photos.filter((photo) => photo.latitude !== null).length;

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {user?.firstName ? `${user.firstName}'s gallery` : "Your gallery"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {photos.length === 0
              ? "Nothing here yet."
              : `${photos.length} photo${photos.length === 1 ? "" : "s"}, private to your account` +
                (located > 0 ? ` · ${located} with a location` : "")}
          </p>
        </div>
        <Link
          href="/camera"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Take a photo
        </Link>
      </header>

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-20 text-center">
          <p className="text-sm font-medium">No photos yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">
            Open the camera and take your first shot. You can press the button, or turn
            on blink capture and let it fire on its own.
          </p>
          <Link
            href="/camera"
            className="mt-6 inline-block rounded-full border border-border px-5 py-2.5 text-sm transition hover:bg-surface-muted"
          >
            Open the camera
          </Link>
        </div>
      ) : (
        <PhotoGrid photos={photos} />
      )}
    </section>
  );
}
