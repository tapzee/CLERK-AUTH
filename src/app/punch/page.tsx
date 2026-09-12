import Link from "next/link";
import { redirect } from "next/navigation";

import { PunchScreen } from "@/components/punch/PunchScreen";
import { can } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";
import { kickWorkerIfPending } from "@/lib/attendance/dress-checks";
import { findWorker, getAttendanceStatus } from "@/lib/attendance/service";
import { StorageError } from "@/lib/storage";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Punch in" };

// Today's punches and the geofence both change through the day, so nothing here
// is worth caching.
export const dynamic = "force-dynamic";

/**
 * The only screen a worker needs.
 *
 * Checked here rather than in `proxy.ts`, so the protection travels with the
 * page no matter how the request is routed to it.
 */
export default async function PunchPage() {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");

  if (state.status === "not-enrolled") {
    return <NotEnrolled email={state.email} />;
  }

  const { viewer } = state;

  let worker;
  try {
    worker = await findWorker(viewer.staffId);
  } catch (error) {
    // The most common cause is "enrolled but no cart", which `findWorker`
    // reports with a message that actually tells them what to ask for.
    return (
      <Shell>
        <EmptyState
          title="Not ready to punch yet"
          body={
            error instanceof StorageError ? error.message : "Please try again in a moment."
          }
        >
          {can(viewer.role, "console:read") && (
            <Link href="/manage/carts" className="btn btn-primary">
              Set up a cart
            </Link>
          )}
        </EmptyState>
      </Shell>
    );
  }

  if (!worker) {
    return <NotEnrolled email={viewer.email} />;
  }

  const status = await getAttendanceStatus(worker);

  // This page is what re-renders while a verdict is outstanding, so the catch-up
  // worker is nudged from here rather than from the API route.
  kickWorkerIfPending(viewer.staffId, status.events);

  return (
    <Shell>
      <PunchScreen status={status} />
      <p className="text-center text-sm">
        <Link href="/me" className="text-muted underline hover:text-foreground">
          My attendance and pay
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-lg space-y-5">
      <PageHeader
        title="Attendance"
        description="Take a selfie at the cart to check in or out."
      />
      {children}
    </section>
  );
}

/**
 * Signed in, but nobody has added them yet.
 *
 * The address is shown because that is the thing a manager needs: roles are
 * granted by email, so handing it over is the entire enrolment request.
 */
function NotEnrolled({ email }: { email: string | null }) {
  return (
    <Shell>
      <EmptyState
        title="You are not enrolled yet"
        body="Your manager has to add you before you can punch. Give them the email address below — it is what your role is attached to."
      >
        <code className="mx-auto block max-w-sm overflow-x-auto rounded-lg bg-surface-muted px-3.5 py-2.5 font-mono text-xs">
          {email ?? "No verified email on this account"}
        </code>
        {!email && (
          <p className="mx-auto mt-3 max-w-sm text-xs text-muted text-pretty">
            Verify your email address in your account settings first — an
            unverified address cannot be matched to a staff record.
          </p>
        )}
      </EmptyState>
    </Shell>
  );
}
