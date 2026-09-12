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

export const DEFAULT_PASS_SCORE = 70;

export function parseGrade(value: unknown): ItemGrade {
  return value === "g" || value === "p" || value === "n" ? value : "?";
}

/**
 * Which items count toward the score, weighted equally.
 *
 * There is no number for an owner to set here. An item counts once its
 * reference photo is uploaded -- uploading the photo *is* the configuration --
 * so a business with no logo on its uniform simply never uploads a logo photo,
 * and the logo is reported but never affects the score. "neat" (overall
 * turnout) has no garment of its own and always counts, because it is read off
 * the same photo regardless of what else was set up.
 *
 * The result reads as a percentage split (three counted items come back as 34,
 * 33, 33) rather than as bare relative units, even though `scoreGrades` only
 * needs the numbers to be proportionate -- a console showing "1%" next to an
 * item that is fully counted would be a display bug wearing a scoring one's
 * clothes.
 */
export function weightsFromReferences(
  presentReferenceKinds: Iterable<ItemKey>,
): Record<ItemKey, number> {
  const present = new Set(presentReferenceKinds);

  // A brand-new uniform has no reference photos yet and still needs a
  // meaningful score, so nothing is silently zeroed out before an owner has
  // had the chance to upload anything.
  const noPhotosYet = REFERENCE_KEYS.every((key) => !present.has(key));
  const counted = ITEM_KEYS.filter(
    (key) => key === "neat" || noPhotosYet || present.has(key),
  );

  const weights = {} as Record<ItemKey, number>;
  for (const key of ITEM_KEYS) weights[key] = 0;

  // Spread 100 as evenly as the count allows, e.g. three items become
  // 34/33/33 rather than three thirds that could never add back up to 100.
  const share = Math.floor(100 / counted.length);
  const remainder = 100 - share * counted.length;
  counted.forEach((key, index) => {
    weights[key] = share + (index < remainder ? 1 : 0);
  });

  return weights;
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
