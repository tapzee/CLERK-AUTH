import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

/**
 * Supabase client authenticated with the secret key.
 *
 * `server-only` makes the build fail if this module is ever pulled into a
 * client bundle. The service role key bypasses Row Level Security, so every
 * caller is responsible for scoping queries to the signed-in Clerk user.
 */

/**
 * Statuses that mean "the request never really happened", so asking again is
 * both safe and likely to work. A 4xx we caused is not on the list: repeating
 * a malformed query just fails the same way three times more slowly.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 150;

/**
 * How long one attempt may hang, and how long retrying may go on in total.
 *
 * Measured on this project: every query the console runs answers in about
 * 200ms. Three seconds is therefore not a limit a healthy read can reach — it
 * is the point at which waiting has stopped being useful. Without it a stalled
 * connection waits out whatever timeout the upstream gateway keeps, which is
 * how `Gateway Timeout` reached a manager in the first place.
 *
 * The total budget is the more important of the two. Retrying is only worth
 * doing while somebody is still waiting for a page: three unbounded attempts
 * would leave the screen hanging longer than the single failure ever did, and
 * a render that outlives the host's own function limit is not an error page at
 * all — it is a blank one.
 */
const ATTEMPT_TIMEOUT_MS = 3_000;
const RETRY_BUDGET_MS = 6_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Adds a deadline without discarding a caller's own abort signal. */
function withDeadline(init: RequestInit | undefined, ms: number): RequestInit {
  const deadline = AbortSignal.timeout(ms);
  const caller = init?.signal;

  if (!caller) return { ...init, signal: deadline };
  if (typeof AbortSignal.any !== "function") return { ...init };

  return { ...init, signal: AbortSignal.any([caller, deadline]) };
}

/**
 * `fetch`, but a transient failure is retried instead of becoming an error page.
 *
 * A dropped connection, a cold Supabase project waking up, or a momentary 503
 * used to surface as `Could not load ...` from whichever query drew the short
 * straw, which React reports in production as the anonymous "error #441" — and
 * which a refresh then fixed, because nothing was actually wrong. That refresh
 * is what this does automatically.
 *
 * **Reads only.** A `POST` that failed *after* Postgres saw it would be applied
 * twice on a replay, and a duplicate punch is a worse outcome than an error
 * page. Writes still fail loudly, and the caller decides.
 */
async function retryingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const replayable = method === "GET" || method === "HEAD";
  const giveUpAt = Date.now() + RETRY_BUDGET_MS;

  // Whatever the last attempt produced, kept so that giving up returns the real
  // 504 the caller can report rather than an invention of this function.
  let failedResponse: Response | undefined;
  let failure: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = giveUpAt - Date.now();
    if (attempt > 1 && remaining <= 0) break;

    const finalAttempt = attempt === MAX_ATTEMPTS;

    try {
      const response = await fetch(
        input,
        replayable ? withDeadline(init, Math.min(ATTEMPT_TIMEOUT_MS, remaining)) : init,
      );
      if (!replayable || finalAttempt || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }
      failedResponse = response;
      warn(method, attempt, `HTTP ${response.status}`);
    } catch (error) {
      // No response at all: DNS, TLS, a reset connection, or our own deadline.
      // A caller who cancelled deliberately is not a failure to paper over.
      if (!replayable || finalAttempt || init?.signal?.aborted) throw error;
      failure = error;
      warn(method, attempt, error);
    }

    // Brief and widening — long enough to outlast a blip, short enough that the
    // next attempt still has budget left to run in.
    await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }

  // Out of budget rather than out of attempts.
  if (failedResponse) return failedResponse;
  throw failure;
}

/** Logged so a retry that saved a page still shows up in the host's logs. */
function warn(method: string, attempt: number, cause: unknown): void {
  console.warn(
    `[supabase] ${method} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying:`,
    cause instanceof Error ? cause.message : cause,
  );
}

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: retryingFetch },
    });
  }
  return client;
}
