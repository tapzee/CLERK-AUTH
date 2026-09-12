import { PayrollBoard } from "@/components/manage/PayrollBoard";
import { can } from "@/lib/auth/rbac";
import { requirePageAccess } from "@/lib/auth/viewer";
import { getPayrollLines } from "@/lib/manage/payroll";
import { monthKey, recentMonths } from "@/lib/payroll/calculate";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Payroll · Console" };

/** How far back the month picker goes. */
const MONTHS_SHOWN = 12;

export default async function PayrollPage({ searchParams }: PageProps<"/manage/payroll">) {
  const viewer = await requirePageAccess("payroll:read");

  const months = recentMonths(MONTHS_SHOWN);
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : null;

  // Only a month the picker actually offers, so a hand-typed query string
  // cannot ask for an arbitrary date range.
  const month = requested && months.includes(requested) ? requested : monthKey(new Date());

  const lines = await getPayrollLines(viewer, month);

  return (
    <section className="space-y-5">
      <PageHeader
        title="Payroll"
        description="Pay is the monthly salary prorated by days present, less any deduction for late days. A manager prepares it; an owner approves it."
      />
      <PayrollBoard
        lines={lines}
        months={months}
        month={month}
        canApprove={can(viewer.role, "payroll:approve")}
      />
    </section>
  );
}
