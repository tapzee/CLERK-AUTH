/**
 * The shape every console form result takes.
 *
 * This lives outside `actions.ts` on purpose. A `"use server"` module may only
 * export async functions: Next.js checks the entry's exports at runtime, when
 * the first action is invoked, and a plain object among them throws
 * `invalid-use-server-value` -- a crash the build cannot catch, because nothing
 * loads that entry until somebody submits a form.
 */
export type ActionState = {
  ok: boolean;
  error: string | null;
  /** Shown on success, e.g. "12 payslips prepared". */
  message?: string;
};

export const IDLE: ActionState = { ok: false, error: null };
