import "server-only";

import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Type,
  type Part,
} from "@google/genai";

import { serverEnv } from "@/lib/env";
import {
  ITEM_LABELS,
  parseGrade,
  type Grades,
  type ItemGrade,
  type ItemKey,
} from "@/lib/uniform/items";

/**
 * Asking Gemini how well a uniform is being worn.
 *
 * This module knows about prompts, images and tokens, and nothing about what a
 * score means -- the vocabulary and the arithmetic live in
 * `src/lib/uniform/items.ts`, which the browser can import too.
 */

/** A photo of the real item, uploaded by an owner. */
export type ReferenceImage = {
  kind: ItemKey;
  bytes: Uint8Array;
  mimeType: string;
};

/** What a reference photo was written up as, the one time it was described. */
export type ReferenceDescription = {
  kind: ItemKey;
  text: string;
};

export type UniformSpec = {
  /** Free text describing the uniform, injected into the prompt verbatim. */
  promptNotes: string | null;
  /** Each item's share of the score. Zero means reported but not scored. */
  weights: Record<ItemKey, number>;
  /** Score at or above which the worker counts as compliant. */
  passScore: number;
  /**
   * Sent as an actual photo on every check. In practice this is only ever the
   * logo: a small emblem cannot be pinned down precisely enough in words, so it
   * is the one item that still needs a real visual match rather than a
   * description -- see the module comment on `describeReferenceImage`.
   */
  referenceImages: ReferenceImage[];
  /**
   * Everything else. Written up once by the model when the photo was
   * uploaded (or by an owner correcting that text), and reused as plain words
   * on every check from then on instead of resending the photo.
   */
  referenceDescriptions: ReferenceDescription[];
};

export type CheckSubject = {
  /** Position in the batch; echoed back by the model so results can be matched. */
  index: number;
  bytes: Uint8Array;
  mimeType: string;
};

export type Observation = {
  index: number;
  items: Grades;
  /** Whether the surroundings look like a food cart -- a free second signal. */
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

/** What "worn badly" means for each item, spelled out for the model. */
const POOR_EXAMPLES: Record<ItemKey, string> = {
  cap: "on the head but pushed back, tilted, or leaving most of the hair uncovered",
  apron: "on but untied, hanging off one shoulder, twisted, or visibly dirty",
  shirt: "the right shirt but crumpled, badly stained, or worn open over something else",
  logo: "present but heavily creased, faded, or mostly hidden behind a strap or fold",
  neat: "uniform broadly on, but scruffy -- untucked, stained, or dishevelled",
};

/**
 * How much of each reference image the model is given to look at.
 *
 * Measured on this project's own photos: LOW = 266 tokens, MEDIUM = 540,
 * HIGH = 1064, ULTRA_HIGH = 2160. In Gemini 3.x this -- not the pixel
 * dimensions -- is what sets the cost of an image. References are clean, close
 * product shots, so they do not need what a staff photo needs.
 */
const REFERENCE_RESOLUTION = PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM;

/**
 * The one-time call that writes up a reference photo, so a full-detail look is
 * worth paying for once -- unlike `REFERENCE_RESOLUTION`, which is spent on
 * every single check.
 */
const DESCRIBE_RESOLUTION = PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH;

/**
 * A hard ceiling on the written-up description, independent of what the
 * prompt below asks for.
 *
 * Unlike the one-off cost of generating it, this text rides on every check-in
 * from then on -- it is exactly the recurring image cost this function exists
 * to replace, so a model that ignores "one or two sentences" cannot turn that
 * saving back into a bill.
 */
const MAX_DESCRIPTION_LENGTH = 240;

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
 * One line per item: the generic default, the owner's own description if one
 * was written up for it, and the worn-badly example.
 *
 * The description is what carries a specific cap or apron -- "navy blue,
 * elbow-length, tied at the back" -- without spending an image on it every
 * single check. `descriptions` only ever holds entries for items that are not
 * the logo; see the module comment above `describeReferenceImage`.
 */
function itemLine(
  key: Exclude<ItemKey, "logo">,
  generic: string,
  descriptions: ReferenceDescription[],
): string {
  const specific = descriptions.find((d) => d.kind === key)?.text;
  const base = specific ? `${generic}. Specifically: ${specific}` : generic;
  return `  ${key.padEnd(7)} - ${base}. "p" = ${POOR_EXAMPLES[key]}`;
}

/**
 * The instruction block and any logo reference photo are identical on every
 * call for a given uniform and only the staff photos change, so they go
 * first: that is the ordering Gemini's implicit cache rewards.
 */
function instructions(uniform: UniformSpec, count: number, hasLogoImage: boolean): string {
  const descriptions = uniform.referenceDescriptions;

  const lines = [
    "You are checking how well food-cart staff are wearing their uniform.",
    "",
    `The uniform is: ${uniform.promptNotes ?? "a cap or hairnet, an apron, and a company shirt"}`,
  ];

  if (hasLogoImage) {
    lines.push(
      "",
      "A reference photo of the real logo follows, labelled REFERENCE. The staff",
      "member's badge or print must match it -- a different logo, or a plain",
      "garment, is not a match.",
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
    itemLine("cap", "a cap or hairnet covering the hair", descriptions),
    itemLine("apron", "an apron over the clothing", descriptions),
    itemLine("shirt", "the uniform shirt described above", descriptions),
    `  logo    - the company logo on the clothing or cap. "p" = ${POOR_EXAMPLES.logo}`,
    itemLine("neat", "overall turnout", descriptions),
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
 * Writes up a reference photo in words, once, so it never has to be resent.
 *
 * Colour and cut are things text describes well, and a sentence is what rides
 * on every check-in from then on instead of the photo itself -- roughly 540
 * input tokens for the same image, every single time, versus a few dozen for
 * its description. The logo is the deliberate exception: matching a small
 * emblem needs a real visual comparison that no amount of wording replaces, so
 * `saveReferenceImage` never calls this for a logo upload, and
 * `UniformSpec.referenceImages` keeps sending it as a photo forever.
 *
 * Returns null rather than throwing on anything that goes wrong -- a photo
 * upload must still succeed even when the write-up fails, just without a
 * description until somebody uploads again or types one in by hand.
 */
export async function describeReferenceImage(
  bytes: Uint8Array,
  mimeType: string,
  kind: Exclude<ItemKey, "logo">,
): Promise<string | null> {
  const prompt = [
    `This is a reference photo of ${ITEM_LABELS[kind].toLowerCase()}, worn as`,
    "part of a staff uniform. Describe it precisely enough that someone looking",
    "at a completely different photo could tell whether a person is wearing a",
    "matching one.",
    "",
    "Cover colour, cut or style, and any distinguishing feature. Do not describe",
    "a logo, badge or printed emblem even if one is visible in this photo -- that",
    "is checked separately, from its own photo.",
    "",
    "Answer in one or two short sentences. No preamble, no markdown, no",
    "quotation marks -- just the description itself.",
  ].join("\n");

  try {
    const response = await genai().models.generateContent({
      model: serverEnv.geminiModel,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, imagePart(bytes, mimeType, DESCRIBE_RESOLUTION)],
        },
      ],
      config: {
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const text = response.text?.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    return text || null;
  } catch (error) {
    console.error("[dresscode] could not describe the reference photo", error);
    return null;
  }
}

/**
 * Judges a batch of photos in one request.
 *
 * Batching amortises the instruction block and the reference photos across
 * every worker in the call rather than resending them each time. The punch
 * screen calls this with a single subject because somebody is standing there
 * waiting; the queue worker calls it with up to eight.
 */
export async function checkUniforms(
  subjects: CheckSubject[],
  uniform: UniformSpec,
  /**
   * Gives up on a slow call. Used by the punch route, where somebody is stood
   * at the cart waiting -- note that aborting is client-side only, so the call
   * still bills if the service had already started work on it.
   */
  signal?: AbortSignal,
): Promise<BatchResult> {
  if (subjects.length === 0) {
    return { observations: [], model: serverEnv.geminiModel, inputTokens: 0, outputTokens: 0 };
  }

  // No point spending tokens -- image or text -- on an item that is not
  // scored, so both lists are filtered by the same weight check.
  const scored = (kind: ItemKey) => (uniform.weights[kind] ?? 0) > 0;
  const images = uniform.referenceImages.filter((reference) => scored(reference.kind));
  const descriptions = uniform.referenceDescriptions.filter((description) =>
    scored(description.kind),
  );

  const parts: Part[] = [
    {
      text: instructions(
        { ...uniform, referenceDescriptions: descriptions },
        subjects.length,
        images.length > 0,
      ),
    },
  ];

  for (const reference of images) {
    parts.push({ text: `REFERENCE -- ${ITEM_LABELS[reference.kind]}:` });
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
      abortSignal: signal,
      // A compliance check should give the same answer twice for the same photo.
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Reasoning tokens bill as output, and grading a cap needs none.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("The model returned an empty response.");

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
        cap: parseGrade(row.cap),
        apron: parseGrade(row.apron),
        shirt: parseGrade(row.shirt),
        logo: parseGrade(row.logo),
        neat: parseGrade(row.neat),
      },
      atCart: parseGrade(row.at_cart),
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
