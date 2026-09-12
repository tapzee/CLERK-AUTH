import { StaffManager } from "@/components/manage/StaffManager";
import { can } from "@/lib/auth/rbac";
import { requirePageAccess } from "@/lib/auth/viewer";
import { listCarts } from "@/lib/manage/carts";
import { listStaff } from "@/lib/manage/staff";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Staff · Console" };

export default async function StaffPage() {
  const viewer = await requirePageAccess("staff:read");

  const [staff, carts] = await Promise.all([listStaff(viewer), listCarts(viewer)]);

  return (
    <section className="space-y-5">
      <PageHeader
        title="Staff"
        description="Who works here, when their shift starts, and what they are paid."
      />
      <StaffManager
        staff={staff}
        carts={carts}
        // The form disables the role field without this; the action refuses it
        // regardless, so this is presentation rather than protection.
        canSetRoles={can(viewer.role, "staff:role:write")}
      />
    </section>
  );
}
