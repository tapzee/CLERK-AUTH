import Link from "next/link";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/ui/primitives";

export const metadata = { title: "Page not found" };

/**
 * The catch-all for a path this app does not have.
 *
 * The way out is `/`, not a guess at a role-specific page: the landing route
 * already reads the session and forwards a manager to the console and everyone
 * else to the camera. Kept static — reading the session here would make the
 * 404 itself a dynamic render on every miss, including from crawlers.
 */
export default function NotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="That page does not exist"
        body="The link may be out of date. Everything in Shift hangs off your own workspace — the button below opens whichever one your account has."
      >
        <Link href="/" className="btn btn-primary px-5 py-2.5">
          Take me to my workspace
        </Link>
      </EmptyState>
    </div>
  );
}
