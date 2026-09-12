import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, AlertCircle, Shield } from "lucide-react";

import { ConsoleNav } from "@/components/manage/ConsoleNav";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";
import { hasUsableScope } from "@/lib/manage/scope";
import { Pill } from "@/components/ui/primitives";

import { NAV_ITEMS } from "./nav";

export const metadata = { title: "Console" };

export const dynamic = "force-dynamic";

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const state = await getViewerState();

  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "not-enrolled") redirect("/punch");

  const { viewer } = state;
  if (!can(viewer.role, "console:read")) redirect("/punch");

  const items = NAV_ITEMS.filter((item) => can(viewer.role, item.permission));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
            Management Console
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {viewer.fullName}
            </h2>
            <Pill tone="accent" className="font-mono text-xs">
              <Shield className="h-3 w-3 inline mr-1" />
              {ROLE_LABELS[viewer.role]}
            </Pill>
          </div>
        </div>
        {/*
          An owner does not clock in through this system -- see the `WORKER`
          permission split in rbac.ts -- so this link would only lead them to a
          screen that refuses them. A manager still works a shift, so it stays
          for them.
        */}
        {can(viewer.role, "attendance:punch") && (
          <Link href="/punch" className="btn btn-ghost shadow-sm text-xs sm:text-sm">
            <Camera className="h-4 w-4 text-accent" />
            <span>Punch Screen</span>
          </Link>
        )}
      </header>

      {!hasUsableScope(viewer) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-xs font-medium text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-pretty">
            You are not assigned to a cart, so there is nothing in scope for you to manage.
            Ask an owner to assign you to a cart.
          </span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <ConsoleNav items={items} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
