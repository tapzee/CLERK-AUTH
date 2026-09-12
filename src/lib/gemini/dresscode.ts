import "server-only";

import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Type,
  type Part,
} from "@google/genai";

import { serverEnv } from "@/lib/env";

/**
 * How well one item is worn.
 *
 * Four buckets, not a number. A model asked to rate an item 0-100 returns
 * something that looks precise and moves between runs on the same photo; asked
 * whether something is worn properly, worn badly, or not worn, it is steady.
 * More buckets than this would add noise rather than detail.
 */
export type ItemGrade = "g" | "p" | "n" | "?";

export const GRADE_LABELS: Record<ItemGrade, string> = {
  g: "worn properly",
  p: "worn badly",
  n: "not worn",
  "?": "could not tell",
};

/** How much credit each grade earns toward the score. */
const GRADE_CREDIT: Record<Exclude<ItemGrade, "?">, number> = {
  g: 1,
  p: 0.5,
  n: 0,
};

export type ItemKey = "cap" | "apron" | "shirt" | "logo" | "neat";

export const ITEM_KEYS: readonly ItemKey[] = ["cap", "apron", "shirt", "logo", "neat"];

/** The items an admin can attach a reference photo to. */
export const REFERENCE_KEYS: readonly ItemKey[] = ["cap", "apron", "shirt", "logo"];

export const ITEM_LABELS: Record<ItemKey, string> = {
  cap: "Cap or hairnet",
  apron: "Apron",
  shirt: "Uniform shirt",
  logo: "Company logo",
  neat: "Overall turnout",
};

/** What "worn badly" means for each item, spelled out for the model. */
const POOR_EXAMPLES: Record<ItemKey, string> = {
  cap: "on the head but pushed back, tilted, or leaving most of the hair uncovered",
  apron: "on but untied, hanging off one shoulder, twisted, or visibly dirty",
  shirt: "the right shirt but crumpled, badly stained, or worn open over something else",
  logo: "present but heavily creased, faded, or mostly hidden behind a strap or fold",
  neat: "uniform broadly on, but scruffy — untucked, stained, or dishevelled",
};

/** A photo of the real item, uploaded by an admin. */
export type ReferenceImage = {
  kind: ItemKey;
  bytes: Uint8Array;
  mimeType: string;
};

export type UniformSpec = {
  /** Free text describing the uniform, injected into the prompt verbatim. */
  promptNotes: string | null;
  /** Each item's share of the score. Zero means reported but not scored. */
  weights: Record<ItemKey, number>;
  /** Score at or above which the staff member counts as compliant. */
  passScore: number;
  references: ReferenceImage[];
};

export type CheckSubject = {
  /** Position in the batch; echoed back by the model so results can be matched. */
  index: number;
  bytes: Uint8Array;
  mimeType: string;
};

export type Observation = {
  index: number;
  items: Record<ItemKey, ItemGrade>;
  /** Whether the surroundings look like a food cart — a free second signal. */
  atCart: ItemGrade;
  why: string | null;
};

export type BatchResult = {
  observations: Observation[];
  model: string;
  inputTokens: number;
  /** Visible output plus thinking, since both bill at the output rate. */
  outputTokens: number;
};

const GRADES = ["g", "p", "n", "?"];

/**
 * How much of each reference image the model is given to look at.
 *
 * Measured on this project's own photos: LOW ≈ 266 tokens, MEDIUM ≈ 540,
 * HIGH ≈ 1064, ULTRA_HIGH ≈ 2160. In Gemini 3.x this — not the pixel
 * dimensions — is what sets the cost of an image. References are clean, close
 * product shots, so they do not need what a staff photo needs.
 */
const REFERENCE_RESOLUTION = PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM;

/**
 * Deliberately small.
 *
 * Output tokens cost several times what input tokens do, and thinking tokens
 * bill at the output rate too, so single-character grades rather than words and
 * no prose unless something is actually wrong.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          i: { type: Type.INTEGER, description: "The staff number given in the prompt" },
          cap: { type: Type.STRING, enum: GRADES },
          apron: { type: Type.STRING, enum: GRADES },
          shirt: { type: Type.STRING, enum: GRADES },
          logo: { type: Type.STRING, enum: GRADES },
          neat: { type: Type.STRING, enum: GRADES },
          at_cart: { type: Type.STRING, enum: GRADES },
          why: {
            type: Type.STRING,
            description: "Only when an item is 'p' or 'n'. A few words. Omit otherwise.",
          },
        },
        required: ["i", "cap", "apron", "shirt", "logo", "neat", "at_cart"],
      },
    },
  },
  required: ["results"],
};

/**
 * The instruction block and the reference photos are identical on every call
 * for a given uniform and only the staff photos change, so they go first: that
 * is the ordering Gemini's implicit cache rewards, and with four references
 * attached the fixed prefix is large enough to reach the threshold.
 */
function instructions(uniform: UniformSpec, count: number, hasReferences: boolean): string {
  const lines = [
    "You are checking how well food-cart staff are wearing their uniform.",
    "",
    `The uniform is: ${uniform.promptNotes ?? "a cap or hairnet, an apron, and a company shirt"}`,
  ];

  if (hasReferences) {
    lines.push(
      "",
      "Reference photos of the real items follow, each labelled REFERENCE.",
      "Judge the staff photos against these, not against a generic idea of a",
      "cap or apron. For the logo, the staff member's badge or print must match",
      "the reference logo — a different logo, or a plain garment, is not a match.",
    );
  }

  lines.push(
    "",
    `Then you will be given ${count} staff photo(s), each preceded by "Staff N:".`,
    "",
    "Grade each item on how it is actually worn, not merely whether it exists:",
    '  "g" - worn properly',
    '  "p" - present but worn badly',
    '  "n" - not worn at all',
    '  "?" - the photo cannot settle it',
    "",
    "Items:",
    `  cap     - a cap or hairnet covering the hair. "p" = ${POOR_EXAMPLES.cap}`,
    `  apron   - an apron over the clothing. "p" = ${POOR_EXAMPLES.apron}`,
    `  shirt   - the uniform shirt described above. "p" = ${POOR_EXAMPLES.shirt}`,
    `  logo    - the company logo on the clothing or cap. "p" = ${POOR_EXAMPLES.logo}`,
    `  neat    - overall turnout. "p" = ${POOR_EXAMPLES.neat}`,
    "  at_cart - whether the surroundings look like a food cart or stall",
    "",
    'Use "?" freely, especially for the logo, which is small and often creased',
    "or angled. A wrong grade either lets an out-of-uniform shift through or",
    'accuses someone who did nothing wrong; "?" is reviewed by a person, so it',
    "is the safe answer whenever you are not sure.",
    "",
    'Return one result per staff photo, with "i" set to that photo\'s number.',
  );

  return lines.join("\n");
}

let client: GoogleGenAI | null = null;

function genai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: serverEnv.geminiApiKey });
  return client;
}

function asGrade(value: unknown): ItemGrade {
  return value === "g" || value === "p" || value === "n" ? value : "?";
}

function imagePart(
  bytes: Uint8Array,
  mimeType: string,
  level: PartMediaResolutionLevel,
): Part {
  return {
    inlineData: { data: Buffer.from(bytes).toString("base64"), mimeType },
    mediaResolution: { level },
  };
}

/**
 * Judges a batch of photos in one request.
 *
 * Batching is what keeps the morning punch rush inside the request-per-minute
 * ceiling, and it amortises the instruction block and the reference photos
 * across every staff member in the call rather than resending them each time.
 */
export async function checkUniforms(
  subjects: CheckSubject[],
  uniform: UniformSpec,
): Promise<BatchResult> {
  if (subjects.length === 0) {
    return { observations: [], model: serverEnv.geminiModel, inputTokens: 0, outputTokens: 0 };
  }

  const references = uniform.references.filter(
    // No point spending tokens on a reference for an item that is not scored.
    (reference) => (uniform.weights[reference.kind] ?? 0) > 0,
  );

  const parts: Part[] = [
    { text: instructions(uniform, subjects.length, references.length > 0) },
  ];

  for (const reference of references) {
    parts.push({ text: `REFERENCE — ${ITEM_LABELS[reference.kind]}:` });
    parts.push(imagePart(reference.bytes, reference.mimeType, REFERENCE_RESOLUTION));
  }

  for (const subject of subjects) {
    // The label goes immediately before its image so the model has an anchor
    // for the index it has to echo back.
    parts.push({ text: `Staff ${subject.index}:` });
    parts.push(
      imagePart(
        subject.bytes,
        subject.mimeType,
        serverEnv.geminiMediaResolution as PartMediaResolutionLevel,
      ),
    );
  }

  const model = serverEnv.geminiModel;
  const response = await genai().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      // A compliance check should give the same answer twice for the same photo.
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Reasoning tokens bill as output, and grading a cap needs none.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("The model returned an empty response.");
  }

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(raw) as { results?: unknown };
  } catch {
    throw new Error(`The model returned text that is not JSON: ${raw.slice(0, 200)}`);
  }

  const rows = Array.isArray(parsed.results) ? parsed.results : [];
  const valid = new Set(subjects.map((subject) => subject.index));

  const observations: Observation[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const index = Number(row.i);
    // A model that invents or repeats an index would otherwise write one
    // person's verdict onto another's record, so unknown indices are dropped
    // and the caller treats the missing ones as unanswered.
    if (!valid.has(index) || observations.some((seen) => seen.index === index)) continue;

    const why = typeof row.why === "string" ? row.why.trim().slice(0, 200) : "";
    observations.push({
      index,
      items: {
        cap: asGrade(row.cap),
        apron: asGrade(row.apron),
        shirt: asGrade(row.shirt),
        logo: asGrade(row.logo),
        neat: asGrade(row.neat),
      },
      atCart: asGrade(row.at_cart),
      why: why || null,
    });
  }

  const usage = response.usageMetadata;
  return {
    observations,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    // Thinking is billed as output, so reporting it separately would understate
    // what the call actually cost.
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}

export type Scored = {
  /** Out of 100, counting an unsure item as half credit. */
  score: number;
  /** Out of 100, counting every unsure item as worn properly. */
  best: number;
  /** Out of 100, counting every unsure item as not worn. */
  worst: number;
  verdict: "pass" | "fail" | "unclear";
};

function weightedScore(
  items: Record<ItemKey, ItemGrade>,
  weights: Record<ItemKey, number>,
  unsure: number,
): number {
  let earned = 0;
  let total = 0;

  for (const key of ITEM_KEYS) {
    const weight = weights[key] ?? 0;
    if (weight <= 0) continue;

    total += weight;
    const grade = items[key];
    earned += weight * (grade === "?" ? unsure : GRADE_CREDIT[grade]);
  }

  // Nothing is scored, so nothing can fail.
  if (total === 0) return 100;
  return Math.round((earned / total) * 100);
}

/**
 * Turns graded observations into a score out of 100.
 *
 * The model grades how each item is worn; the arithmetic happens here. Asking
 * the model for the number itself would give something that looks precise and
 * is not reproducible — the same photo can come back 78 one minute and 85 the
 * next. Deriving it from grades, using weights an admin set, gives a score that
 * is stable, explainable ("apron worn badly, half of 25"), and adjustable
 * without touching the prompt.
 *
 * Three numbers, not one: an unsure item would otherwise be buried in a single
 * average. The verdict only commits to pass or fail when the best and worst
 * readings agree, so a photo too poor to judge goes to a person instead of
 * being guessed at.
 */
export function scoreObservation(
  observation: Observation,
  uniform: Pick<UniformSpec, "weights" | "passScore">,
): Scored {
  const best = weightedScore(observation.items, uniform.weights, 1);
  const worst = weightedScore(observation.items, uniform.weights, 0);
  const score = weightedScore(observation.items, uniform.weights, 0.5);

  const verdict =
    worst >= uniform.passScore ? "pass" : best < uniform.passScore ? "fail" : "unclear";

  return { score, best, worst, verdict };
}
