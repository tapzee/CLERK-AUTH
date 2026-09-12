/**
 * What a uniform is made of, and how a set of grades becomes a score.
 *
 * Pure and dependency-free, so both the punch screen (which has to tell a
 * worker *why* they were turned away) and the queue worker (which writes the
 * verdict) share one vocabulary instead of keeping two copies in step.
 *
 * The model call itself lives in `src/lib/gemini/dresscode.ts`.
 */

export type ItemKey = "cap" | "apron" | "shirt" | "logo" | "neat";

export const ITEM_KEYS: readonly ItemKey[] = ["cap", "apron", "shirt", "logo", "neat"];

/** The items an owner can attach a reference photo to. "neat" has no garment. */
export const REFERENCE_KEYS: readonly ItemKey[] = ["cap", "apron", "shirt", "logo"];

export const ITEM_LABELS: Record<ItemKey, string> = {
  cap: "Cap or hairnet",
  apron: "Apron",
  shirt: "Uniform shirt",
  logo: "Company logo",
  neat: "Overall turnout",
};

/** Short forms, for sentences addressed to the worker. */
export const ITEM_NOUNS: Record<ItemKey, string> = {
  cap: "cap",
  apron: "apron",
  shirt: "uniform shirt",
  logo: "logo",
  neat: "turnout",
};

/**
 * How well one item is worn.
 *
 * Four buckets, not a number. A model asked to rate an item 0-100 returns
 * something that looks precise and moves between runs on the same photo; asked
 * whether something is worn properly, worn badly, or not worn, it is steady.
 */
export type ItemGrade = "g" | "p" | "n" | "?";

export const GRADE_LABELS: Record<ItemGrade, string> = {
  g: "worn properly",
  p: "worn badly",
  n: "not worn",
  "?": "could not tell",
};

/** How much credit each grade earns toward the score. */
const GRADE_CREDIT: Record<Exclude<ItemGrade, "?">, number> = { g: 1, p: 0.5, n: 0 };

/** Default spread across the five items, used when a cart has no uniform set. */
export const DEFAULT_WEIGHTS: Record<ItemKey, number> = {
  cap: 20,
  apron: 20,
  shirt: 25,
  logo: 15,
  neat: 20,
};

export const DEFAULT_PASS_SCORE = 70;

export function parseGrade(value: unknown): ItemGrade {
  return value === "g" || value === "p" || value === "n" ? value : "?";
}

/**
 * Coerces stored weights into a complete, sane set.
 *
 * An all-zero set would make every check trivially pass, which is never what an
 * owner meant, so it falls back rather than silently rubber-stamping everyone.
 */
export function normaliseWeights(raw: unknown): Record<ItemKey, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const weights = {} as Record<ItemKey, number>;

  for (const key of ITEM_KEYS) {
    const value = Number(source[key]);
    weights[key] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  return ITEM_KEYS.some((key) => weights[key] > 0) ? weights : { ...DEFAULT_WEIGHTS };
}

export type Grades = Record<ItemKey, ItemGrade>;

export type Scored = {
  /** Out of 100, counting an unsure item as half credit. This is what is shown. */
  score: number;
  /** Out of 100, counting every unsure item as worn properly. */
  best: number;
  /** Out of 100, counting every unsure item as not worn. */
  worst: number;
  verdict: "pass" | "fail" | "unclear";
};

function weightedScore(
  items: Grades,
  weights: Record<ItemKey, number>,
  unsureCredit: number,
): number {
  let earned = 0;
  let total = 0;

  for (const key of ITEM_KEYS) {
    const weight = weights[key] ?? 0;
    if (weight <= 0) continue;

    total += weight;
    const grade = items[key];
    earned += weight * (grade === "?" ? unsureCredit : GRADE_CREDIT[grade]);
  }

  // Nothing is scored, so nothing can fail.
  return total === 0 ? 100 : Math.round((earned / total) * 100);
}

/**
 * Turns graded items into a score out of 100.
 *
 * The model grades how each item is worn; the arithmetic happens here. Asking
 * the model for the number itself would give something that looks precise and
 * is not reproducible -- the same photo can come back 78 one minute and 85 the
 * next. Deriving it from grades, using weights an owner set, gives a score that
 * is stable, explainable ("apron worn badly, half of 25"), and adjustable
 * without touching the prompt.
 *
 * Three numbers, not one: an unsure item would otherwise be buried in a single
 * average. The verdict only commits to pass or fail when the best and worst
 * readings agree, so a photo too poor to judge goes to a person instead of
 * being guessed at.
 */
export function scoreGrades(
  items: Grades,
  weights: Record<ItemKey, number>,
  passScore: number,
): Scored {
  const best = weightedScore(items, weights, 1);
  const worst = weightedScore(items, weights, 0);
  const score = weightedScore(items, weights, 0.5);

  const verdict = worst >= passScore ? "pass" : best < passScore ? "fail" : "unclear";

  return { score, best, worst, verdict };
}

/** The item keys sitting at one grade, in a stable order. */
export function itemsAtGrade(
  items: Partial<Record<string, string>> | null,
  grade: ItemGrade,
): ItemKey[] {
  if (!items) return [];
  return ITEM_KEYS.filter((key) => items[key] === grade);
}

/** "cap", "cap and apron", "cap, apron and logo" */
export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * A sentence telling the worker what to fix, e.g. "You are not wearing a cap,
 * and your apron is worn badly."
 *
 * Returns null when nothing is wrong, so the caller can fall back to a score.
 */
export function describeFaults(items: Partial<Record<string, string>> | null): string | null {
  const missing = itemsAtGrade(items, "n").map((key) => ITEM_NOUNS[key]);
  const sloppy = itemsAtGrade(items, "p").map((key) => ITEM_NOUNS[key]);

  const clauses = [
    missing.length > 0 ? `no ${joinList(missing)}` : "",
    sloppy.length > 0 ? `${joinList(sloppy)} worn badly` : "",
  ].filter(Boolean);

  return clauses.length > 0 ? clauses.join(", ") : null;
}
