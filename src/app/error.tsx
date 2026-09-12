"use client";

import { useEffect } from "react";

/**
 * Last line of defence for a render that throws.
 *
 * Without a boundary here a server-side render error is a bare 500 and React
 * only reports its minified code, which names no cause. Production still
 * withholds the message itself, but the digest it does send is the key that
 * matches the entry in the host's logs — so it is printed rather than hidden.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-lg space-y-6 py-16 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
          Something broke on the server
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted text-pretty">
          The page could not finish loading. Trying again is usually enough; if
          it keeps happening, quote the reference below.
        </p>
      </div>

      <dl className="mx-auto max-w-sm space-y-3 rounded-[10px] border border-border bg-surface-sunken px-5 py-4 text-left">
        <div>
          <dt className="label mb-0">Message</dt>
          <dd className="mt-0.5 break-words font-mono text-xs">
            {error.message || "withheld in production"}
          </dd>
        </div>
        {error.digest && (
          <div>
            <dt className="label mb-0">Reference</dt>
            <dd className="mt-0.5 break-words font-mono text-xs">{error.digest}</dd>
          </div>
        )}
      </dl>

      <button
        onClick={reset}
        className="btn btn-primary px-5 py-2.5"
      >
        Try again
      </button>
    </section>
  );
}
