import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, Store } from "lucide-react";

import { PunchScreen } from "@/components/punch/PunchScreen";
import { can } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";
import { kickWorkerIfPending } from "@/lib/attendance/dress-checks";
import { findWorker, getAttendanceStatus } from "@/lib/attendance/service";
import { StorageError } from "@/lib/storage";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Punch in" };

export const dynamic = "force-dynamic";

export default async function PunchPage() {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");

  if (state.status === "not-enrolled") {
    return <NotEnrolled email={state.email} />;
  }

  const { viewer } = state;

  // An owner does not clock in through this system -- see the `WORKER`
  // permission split in rbac.ts -- so they belong at the console, not at a
  // screen that would otherwise tell them to go find a cart to be assigned to.
  if (!can(viewer.role, "attendance:punch")) redirect("/manage");

  let worker;
  try {
    worker = await findWorker(viewer.staffId);
  } catch (error) {
    return (
      <Shell>
        <EmptyState
          icon={<Store className="h-5 w-5" />}
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

  kickWorkerIfPending(viewer.staffId, status.events);

  return (
    <Shell>
      <PunchScreen status={status} />
      <div className="pt-2 text-center">
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <span>View monthly attendance &amp; salary record</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-lg space-y-5">
      <PageHeader
        eyebrow="Worker Check-in"
        title="Attendance Punch"
        description="Verify uniform and log attendance with one selfie at the cart."
      />
      {children}
    </section>
  );
}

function NotEnrolled({ email }: { email: string | null }) {
  return (
    <Shell>
      <EmptyState
        icon={<Mail className="h-5 w-5" />}
        title="You are not enrolled yet"
        body="Your manager has to add you before you can punch. Provide the registered email address below:"
      >
        <code className="mx-auto mt-2 block max-w-sm overflow-x-auto rounded-xl border border-border/60 bg-surface px-3.5 py-2 font-mono text-xs text-foreground">
          {email ?? "No verified email on this account"}
        </code>
        {!email && (
          <p className="mx-auto mt-3 max-w-sm text-xs text-muted text-pretty">
            Verify your email address in your account settings first.
          </p>
        )}
      </EmptyState>
    </Shell>
  );
}
