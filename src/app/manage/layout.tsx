import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsoleNav } from "@/components/manage/ConsoleNav";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";
import { hasUsableScope } from "@/lib/manage/scope";
import { Pill } from "@/components/ui/primitives";

import { NAV_ITEMS } from "./nav";

export const metadata = { title: "Console" };

// Attendance, the review queue and payroll all change through the day, and the
// console is only ever a handful of people, so nothing here is worth caching.
export const dynamic = "force-dynamic";

/**
 * The management console shell.
 *
 * Guards the whole section once, then hands each page a nav filtered to what
 * this role may actually open. Every page and every action re-checks its own
 * permission: this layout decides what is *shown*, not what is *allowed*.
 */
export default async function ManageLayout({ children }: LayoutProps<"/manage">) {
  const state = await getViewerState();

  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "not-enrolled") redirect("/punch");

  const { viewer } = state;
  if (!can(viewer.role, "console:read")) redirect("/punch");

  const items = NAV_ITEMS.filter((item) => can(viewer.role, item.permission));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Console</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">
            {viewer.fullName}
            <Pill tone="accent">{ROLE_LABELS[viewer.role]}</Pill>
          </p>
        </div>
        <Link href="/punch" className="btn btn-ghost">
          My punch screen
        </Link>
      </header>

      {/*
        A manager with no cart is a real misconfiguration and an easy one to
        miss: every scoped query would return nothing and the console would look
        merely empty rather than broken.
      */}
      {!hasUsableScope(viewer) && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning text-pretty">
          You are not assigned to a cart, so there is nothing in scope for you to
          manage. Ask an owner to assign you to one.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <ConsoleNav items={items} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
