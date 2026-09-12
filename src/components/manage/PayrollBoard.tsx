"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  decidePayrollAction,
  markPaidAction,
  preparePayrollAction,
} from "@/app/manage/actions";
import { IDLE, type ActionState } from "@/lib/manage/action-state";
import type { PayrollLine, RunStatus } from "@/lib/manage/payroll";
import { formatMoney, formatMonth } from "@/lib/payroll/calculate";
import { Card, EmptyState, Pill, type Tone } from "@/components/ui/primitives";
import { FormFeedback, SubmitButton } from "@/components/ui/form";

/**
 * One month of pay: what attendance says, what was sent for approval, and what
 * the owner decided.
 *
 * `live` and `run` are shown side by side on purpose. A run freezes its figures
 * when it is prepared, so if somebody's salary or attendance changed afterwards
 * the two disagree -- and that disagreement is exactly what a manager needs to
 * see before chasing an approval for a stale number.
 */
export function PayrollBoard({
  lines,
  months,
  month,
  canApprove,
}: {
  lines: PayrollLine[];
  months: string[];
  month: string;
  canApprove: boolean;
}) {
  const router = useRouter();

  const pendingApproval = lines.filter((line) => line.run?.status === "pending");
  const unpaid = lines.filter((line) => line.staff.monthlySalary === null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Month</span>
          <select
            value={month}
            onChange={(event) => router.push(`/manage/payroll?month=${event.target.value}`)}
            className="input w-auto"
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {formatMonth(key)}
              </option>
            ))}
          </select>
        </label>

        <PrepareAll lines={lines} month={month} />
      </div>

      {unpaid.length > 0 && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning text-pretty">
          {unpaid.length} {unpaid.length === 1 ? "person has" : "people have"} no salary
          set, so nothing can be prepared for them. Set one on the Staff screen.
        </p>
      )}

      {canApprove && pendingApproval.length > 0 && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent text-pretty">
          {pendingApproval.length} {pendingApproval.length === 1 ? "payment is" : "payments are"}{" "}
          waiting on your approval, totalling{" "}
          {formatMoney(pendingApproval.reduce((sum, line) => sum + (line.run?.net ?? 0), 0))}.
        </p>
      )}

      {lines.length === 0 ? (
        <EmptyState title="Nobody to pay" body="Enrol staff and set their salary first." />
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.staff.id}>
              <PayrollRow line={line} month={month} canApprove={canApprove} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sends every eligible person for this month in one go. */
function PrepareAll({ lines, month }: { lines: PayrollLine[]; month: string }) {
  const [state, action] = useActionState<ActionState, FormData>(preparePayrollAction, IDLE);

  const eligible = lines.filter(
    (line) =>
      line.staff.monthlySalary !== null &&
      line.run?.status !== "approved" &&
      line.run?.status !== "paid",
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="periodMonth" value={month} />
      {eligible.map((line) => (
        <input key={line.staff.id} type="hidden" name="staffId" value={line.staff.id} />
      ))}

      <FormFeedback state={state} />
      <SubmitButton pendingLabel="Preparing…" disabled={eligible.length === 0}>
        Prepare {eligible.length > 0 ? `${eligible.length} ` : ""}for approval
      </SubmitButton>
    </form>
  );
}

const STATUS_TONE: Record<RunStatus, Tone> = {
  pending: "accent",
  approved: "success",
  declined: "danger",
  paid: "success",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  declined: "Declined",
  paid: "Paid",
};

function PayrollRow({
  line,
  month,
  canApprove,
}: {
  line: PayrollLine;
  month: string;
  canApprove: boolean;
}) {
  const { staff, run, live } = line;

  // The frozen run is the truth once one exists; `live` is what would be
  // prepared today.
  const shown = run ?? {
    daysPresent: line.daysPresent,
    daysLate: line.daysLate,
    gross: live.gross,
    deductions: live.deductions,
    net: live.net,
  };

  /*
   * A prepared run whose inputs have moved on.
   *
   * Only worth flagging while it is still pending: once an owner has approved
   * or declined it, the frozen figures are the decision they made and later
   * attendance is next month's problem.
   */
  const stale =
    run !== null &&
    run.status === "pending" &&
    (run.daysPresent !== line.daysPresent ||
      run.daysLate !== line.daysLate ||
      run.net !== live.net);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">{staff.fullName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {staff.monthlySalary === null
              ? "No salary set"
              : `${formatMoney(staff.monthlySalary)}/month ÷ ${staff.workingDaysPerMonth} days`}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{formatMoney(shown.net)}</p>
          {run && <Pill tone={STATUS_TONE[run.status]}>{STATUS_LABEL[run.status]}</Pill>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Figure label="Days present" value={String(shown.daysPresent)} />
        <Figure
          label="Days late"
          value={String(shown.daysLate)}
          tone={shown.daysLate > 0 ? "warning" : "neutral"}
        />
        <Figure label="Gross" value={formatMoney(shown.gross)} />
        <Figure
          label="Deductions"
          value={shown.deductions > 0 ? `−${formatMoney(shown.deductions)}` : "—"}
          tone={shown.deductions > 0 ? "danger" : "neutral"}
        />
      </dl>

      {stale && (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning text-pretty">
          Attendance or salary has changed since this was prepared — it would now
          come to {formatMoney(live.net)}. Prepare it again to refresh the figures.
        </p>
      )}

      {run?.note && (
        <p className="mt-3 text-xs text-muted text-pretty">Note: {run.note}</p>
      )}

      {canApprove && run && <Decision run={run} month={month} />}
    </Card>
  );
}

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const colour: Record<Tone, string> = {
    neutral: "text-foreground",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <div>
      <dt className="label mb-0.5">{label}</dt>
      <dd className={`tabular-nums ${colour[tone]}`}>{value}</dd>
    </div>
  );
}

/** The owner's controls: approve, decline, or record that it has been paid. */
function Decision({
  run,
  month,
}: {
  run: NonNullable<PayrollLine["run"]>;
  month: string;
}) {
  const [decideState, decide] = useActionState<ActionState, FormData>(
    decidePayrollAction,
    IDLE,
  );
  const [paidState, pay] = useActionState<ActionState, FormData>(markPaidAction, IDLE);

  if (run.status === "pending") {
    return (
      <form action={decide} className="mt-4 space-y-3 border-t border-border pt-3">
        <input type="hidden" name="runId" value={run.id} />
        <input type="hidden" name="periodMonth" value={month} />

        <input name="note" placeholder="Reason (optional)" className="input" />
        <FormFeedback state={decideState} />

        <div className="flex flex-wrap gap-2.5">
          <SubmitButton name="decision" value="approved" pendingLabel="Approving…">
            Approve {formatMoney(run.net)}
          </SubmitButton>
          <SubmitButton name="decision" value="declined" variant="danger" pendingLabel="Declining…">
            Decline
          </SubmitButton>
        </div>
      </form>
    );
  }

  if (run.status === "approved") {
    return (
      <form action={pay} className="mt-4 space-y-3 border-t border-border pt-3">
        <input type="hidden" name="runId" value={run.id} />
        <FormFeedback state={paidState} />
        <SubmitButton variant="ghost" pendingLabel="Saving…">
          Mark as paid
        </SubmitButton>
      </form>
    );
  }

  return null;
}
