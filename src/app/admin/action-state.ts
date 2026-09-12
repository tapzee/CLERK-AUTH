/**
 * Shared shape for every admin form result.
 *
 * This lives outside `actions.ts` on purpose. A `"use server"` module may only
 * export async functions: Next.js checks the entry's exports at runtime, when
 * the first action is invoked, and a plain object among them throws
 * `invalid-use-server-value` — a crash the build cannot catch, because nothing
 * loads that entry until someone submits a form.
 */
export type ActionState = { ok: boolean; error: string | null };

export const IDLE: ActionState = { ok: false, error: null };
