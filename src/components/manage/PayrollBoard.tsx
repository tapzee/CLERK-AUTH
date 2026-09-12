"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Calendar,
  Send,
  AlertCircle,
  CreditCard,
} from "lucide-react";

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4 text-accent" />
          <span className="text-muted text-xs uppercase tracking-wider">Payroll Month</span>
          <select
            value={month}
            onChange={(event) => router.push(`/manage/payroll?month=${event.target.value}`)}
            className="input w-auto font-mono text-xs font-semibold py-1.5"
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
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {unpaid.length} {unpaid.length === 1 ? "worker has" : "workers have"} no monthly salary set.
            Configure salaries on the Staff tab to include them in payroll.
          </span>
        </div>
      )}

      {canApprove && pendingApproval.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent-soft p-3.5 text-xs text-accent">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {pendingApproval.length} {pendingApproval.length === 1 ? "payment is" : "payments are"}{" "}
            waiting for your approval, totalling{" "}
            <strong>{formatMoney(pendingApproval.reduce((sum, line) => sum + (line.run?.net ?? 0), 0))}</strong>.
          </span>
        </div>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-5 w-5" />}
          title="No payroll entries"
          body="Enrol staff and assign their base salary to generate monthly payroll."
        />
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
      <SubmitButton
        pendingLabel="Preparing…"
        disabled={eligible.length === 0}
        icon={<Send className="h-3.5 w-3.5" />}
      >
        Prepare {eligible.length > 0 ? `${eligible.length} ` : ""}for Approval
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
  pending: "Waiting Approval",
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

  const shown = run ?? {
    daysPresent: line.daysPresent,
    daysLate: line.daysLate,
    gross: live.gross,
    deductions: live.deductions,
    net: live.net,
  };

  const stale =
    run !== null &&
    run.status === "pending" &&
    (run.daysPresent !== line.daysPresent ||
      run.daysLate !== line.daysLate ||
      run.net !== live.net);

  return (
    <Card className="p-4 transition-all hover:border-border">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent text-sm font-semibold">
            {staff.fullName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground text-sm sm:text-base">{staff.fullName}</p>
              {staff.role === "manager" && (
                <Pill tone="accent" className="text-[10px]">
                  Manager
                </Pill>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted font-mono">
              {staff.monthlySalary === null
                ? "No salary configured"
                : `${formatMoney(staff.monthlySalary)}/mo ÷ ${staff.workingDaysPerMonth} days`}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums text-foreground">{formatMoney(shown.net)}</p>
          {run ? (
            <Pill tone={STATUS_TONE[run.status]}>{STATUS_LABEL[run.status]}</Pill>
          ) : (
            <Pill tone="neutral">Unprepared</Pill>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-3 text-xs sm:grid-cols-4">
        <Figure label="Days Present" value={String(shown.daysPresent)} />
        <Figure
          label="Days Late"
          value={staff.role === "manager" ? "— (Flexible)" : String(shown.daysLate)}
          tone={staff.role !== "manager" && shown.daysLate > 0 ? "warning" : "neutral"}
        />
        <Figure label="Gross" value={formatMoney(shown.gross)} />
        <Figure
          label="Deductions"
          value={shown.deductions > 0 ? `−${formatMoney(shown.deductions)}` : "—"}
          tone={shown.deductions > 0 ? "danger" : "neutral"}
        />
      </dl>

      {stale && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Attendance updated since this run was prepared (now {formatMoney(live.net)}).
            Re-prepare to sync figures.
          </span>
        </div>
      )}

      {run?.note && (
        <p className="mt-2.5 text-xs text-muted text-pretty">Note: {run.note}</p>
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
      <dt className="label mb-0.5 text-[10px]">{label}</dt>
      <dd className={`font-mono font-semibold text-xs tabular-nums ${colour[tone]}`}>{value}</dd>
    </div>
  );
}

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

        <input
          name="note"
          placeholder="Sign-off note or reason (optional)"
          className="input text-xs"
        />
        <FormFeedback state={decideState} />

        <div className="flex flex-wrap gap-2.5">
          <SubmitButton
            name="decision"
            value="approved"
            pendingLabel="Approving…"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          >
            Approve {formatMoney(run.net)}
          </SubmitButton>
          <SubmitButton
            name="decision"
            value="declined"
            variant="danger"
            pendingLabel="Declining…"
            icon={<XCircle className="h-3.5 w-3.5" />}
          >
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
        <SubmitButton
          variant="ghost"
          pendingLabel="Recording…"
          icon={<CreditCard className="h-3.5 w-3.5 text-success" />}
        >
          Mark as Paid
        </SubmitButton>
      </form>
    );
  }

  return null;
}
