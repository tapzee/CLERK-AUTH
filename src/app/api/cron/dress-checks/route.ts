import { NextResponse } from "next/server";

import { runDressCheckBatch, type WorkerReport } from "@/lib/attendance/dress-checks";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;
// The queue is read fresh every invocation; caching this would be a bug.
export const dynamic = "force-dynamic";

/**
 * How many batches one invocation will drain before handing back.
 *
 * A morning rush can queue more than a single batch. Bounded so the function
 * cannot run past `maxDuration` — whatever is left waits for the next minute.
 */
const MAX_BATCHES = 5;

/**
 * The durable half of the dress-check queue.
 *
 * `after()` on the punch route handles the common case within a second or two;
 * this exists for what that misses — a model timeout, a function that died
 * mid-batch, or a burst bigger than one batch. Rows are claimed atomically, so
 * the two running at once is safe.
 */
export async function GET(request: Request) {
  // Vercel Cron sends this header. Without the check the queue worker — and the
  // spend attached to it — would be triggerable by anyone who guessed the path.
  const presented = request.headers.get("authorization");
  if (presented !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const totals: WorkerReport = {
    claimed: 0, judged: 0, failed: 0, calls: 0, inputTokens: 0, outputTokens: 0,
  };

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const report = await runDressCheckBatch();

      totals.claimed += report.claimed;
      totals.judged += report.judged;
      totals.failed += report.failed;
      totals.calls += report.calls;
      totals.inputTokens += report.inputTokens;
      totals.outputTokens += report.outputTokens;

      if (report.note) totals.note = report.note;
      // Nothing left to claim, or the budget stopped us.
      if (report.claimed === 0 || report.note) break;
    }

    return NextResponse.json(totals);
  } catch (error) {
    console.error("[cron/dress-checks]", error);
    return NextResponse.json(
      { error: "Worker failed.", ...totals },
      { status: 500 },
    );
  }
}
