import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AttendancePunch } from "@/components/AttendancePunch";
import { kickWorkerIfPending } from "@/lib/attendance/dress-checks";
import { findStaff, getAttendanceStatus } from "@/lib/attendance/service";
import { StorageError } from "@/lib/storage";

export const metadata = { title: "Attendance · Live Photos" };

// Today's punches and the geofence both change through the day, so nothing here
// is worth caching.
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  // Checked here rather than in proxy.ts, so protection travels with the page.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let staff;
  try {
    staff = await findStaff(userId);
  } catch (error) {
    return (
      <Shell>
        <Notice
          title="Could not load your staff record"
          body={error instanceof StorageError ? error.message : "Please try again."}
        />
      </Shell>
    );
  }

  if (!staff) {
    return (
      <Shell>
        <Notice
          title="You are not enrolled yet"
          body="An admin has to add you to the staff table before you can punch. Give them the id below."
        >
          <code className="mt-4 block overflow-x-auto rounded-lg bg-surface-muted px-3.5 py-2.5 font-mono text-xs">
            {userId}
          </code>
          <p className="mt-4 text-xs text-muted">
            Setting this up yourself?{" "}
            <Link href="/admin" className="underline hover:text-foreground">
              Open the admin panel
            </Link>
            .
          </p>
        </Notice>
      </Shell>
    );
  }

  const status = await getAttendanceStatus(staff);

  // This page is what the punch screen re-renders while it waits for a verdict,
  // so the retry hangs off here rather than off the API route.
  kickWorkerIfPending(userId, status.events);

  const privileged = staff.role === "admin" || staff.role === "manager";

  return (
    <Shell>
      <AttendancePunch status={status} />
      {privileged && (
        <p className="text-center">
          <Link href="/admin" className="text-sm text-muted underline hover:text-foreground">
            Manage carts and staff
          </Link>
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="mt-1 text-sm text-muted text-pretty">
          Punch in and out from the cart. The photo and your distance from the cart are
          recorded with every punch.
        </p>
      </header>
      {children}
    </section>
  );
}

function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">{body}</p>
      {children}
    </div>
  );
}
