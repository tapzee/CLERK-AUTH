import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { CartManager } from "@/components/admin/CartManager";
import { ClaimAdmin } from "@/components/admin/ClaimAdmin";
import { StaffManager } from "@/components/admin/StaffManager";
import { UniformManager } from "@/components/admin/UniformManager";
import {
  findViewer,
  listCarts,
  listStaff,
  listUniforms,
  staffTableIsEmpty,
} from "@/lib/attendance/admin";
import { StorageError } from "@/lib/storage";

export const metadata = { title: "Admin · Live Photos" };

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  try {
    return await renderAdmin(userId);
  } catch (error) {
    // Without this the page is a bare "a server error occurred", which says
    // nothing about a missing table or an unreachable database — and this is
    // the one screen where whoever is looking can actually act on that.
    console.error("[admin]", error);
    return (
      <Shell>
        <div className="rounded-2xl border border-dashed border-[color:var(--danger)]/40 px-6 py-10 text-center">
          <p className="text-sm font-medium">The admin panel could not load</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted text-pretty">
            {error instanceof StorageError
              ? error.message
              : "Something went wrong reading the database. Check that the migrations in supabase/ have been run against the project this deployment points at."}
          </p>
        </div>
      </Shell>
    );
  }
}

async function renderAdmin(userId: string) {
  // Before anyone is enrolled there is no role to check against, so the
  // bootstrap path is offered instead of a permission error.
  if (await staffTableIsEmpty()) {
    return (
      <Shell>
        <ClaimAdmin clerkUserId={userId} />
      </Shell>
    );
  }

  const viewer = await findViewer(userId);
  if (!viewer || (viewer.role !== "admin" && viewer.role !== "manager")) {
    return (
      <Shell>
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">Not your area</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">
            The admin panel is limited to managers and admins.
          </p>
          <Link
            href="/attendance"
            className="mt-6 inline-block rounded-full border border-border px-5 py-2.5 text-sm transition hover:bg-surface-muted"
          >
            Go to attendance
          </Link>
        </div>
      </Shell>
    );
  }

  const [carts, staff, uniforms] = await Promise.all([
    listCarts(),
    listStaff(),
    listUniforms(),
  ]);

  return (
    <Shell>
      <CartManager carts={carts} uniforms={uniforms} />
      <hr className="border-border" />
      <StaffManager staff={staff} carts={carts} />
      <hr className="border-border" />
      <UniformManager uniforms={uniforms} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted text-pretty">
          Carts and who works at them.
        </p>
      </header>
      {children}
    </section>
  );
}
