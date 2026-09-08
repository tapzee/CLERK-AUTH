"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { PhotoWithUrl } from "@/lib/photos";

export function PhotoGrid({ photos }: { photos: PhotoWithUrl[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    setDeletingId(id);
    await fetch(`/api/photos/${id}`, { method: "DELETE" });
    setDeletingId(null);
    startTransition(() => router.refresh());
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => {
        const hasCoords = photo.latitude !== null && photo.longitude !== null;

        return (
          <li
            key={photo.id}
            className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-muted/40"
          >
            <div className="relative aspect-square bg-black">
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth optimizing
                <img
                  src={photo.url}
                  alt={`Photo taken ${new Date(photo.captured_at).toLocaleString()}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-white/50">
                  Unavailable
                </div>
              )}

              {photo.capture_method === "blink" && (
                <span
                  className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white backdrop-blur"
                  title="Taken automatically by the blink detector"
                >
                  blink
                </span>
              )}

              <button
                onClick={() => remove(photo.id)}
                disabled={pending || deletingId === photo.id}
                className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white opacity-0 backdrop-blur transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
              >
                {deletingId === photo.id ? "Deleting…" : "Delete"}
              </button>
            </div>

            <div className="space-y-1.5 px-4 py-3">
              {/*
                The server renders this in the server's timezone and the browser
                in the viewer's, so the two can differ. Local time is what is
                actually useful here, so the mismatch is suppressed rather than
                forcing everyone onto UTC.
              */}
              <time
                dateTime={photo.captured_at}
                suppressHydrationWarning
                className="block text-xs text-muted"
              >
                {new Date(photo.captured_at).toLocaleString()}
              </time>

              {hasCoords ? (
                <a
                  href={`https://www.google.com/maps?q=${photo.latitude},${photo.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-mono text-xs text-muted transition hover:text-foreground hover:underline"
                  title={
                    photo.accuracy_m
                      ? `Accurate to about ${Math.round(photo.accuracy_m)} metres`
                      : undefined
                  }
                >
                  {photo.latitude!.toFixed(5)}, {photo.longitude!.toFixed(5)}
                  {photo.accuracy_m !== null && ` ±${Math.round(photo.accuracy_m)}m`}
                </a>
              ) : (
                <span className="block truncate text-xs text-muted/70">
                  {photo.location_error
                    ? `No location — ${photo.location_error}`
                    : "No location"}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
