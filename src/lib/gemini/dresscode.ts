import "server-only";

import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

import { serverEnv } from "@/lib/env";

/** One observation per item. "?" means the image cannot settle it. */
export type ItemState = "y" | "n" | "?";

export type UniformSpec = {
  /** Free text describing the uniform, e.g. "navy polo, black apron, black cap". */
  promptNotes: string | null;
  /** Which items actually fail a check when absent. */
  requiredItems: Record<string, boolean>;
};

export type CheckSubject = {
  /** Position in the batch; echoed back by the model so results can be matched. */
  index: number;
  bytes: Uint8Array;
  mimeType: string;
};

export type Observation = {
  index: number;
  cap: ItemState;
  apron: ItemState;
  shirt: ItemState;
  /** Whether the surroundings look like a food cart — a free second signal. */
  atCart: ItemState;
  why: string | null;
};

export type BatchResult = {
  observations: Observation[];
  model: string;
  inputTokens: number;
  /** Visible output plus thinking, since both bill at the output rate. */
  outputTokens: number;
};

const STATES = ["y", "n", "?"];

/**
 * Deliberately small.
 *
 * Output tokens cost several times what input tokens do, and thinking tokens
 * bill at the output rate too, so single-character enums rather than words and
 * no prose unless something is actually wrong. `why` is not required, which is
 * what lets the model omit it on a clean pass.
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
          cap: { type: Type.STRING, enum: STATES },
          apron: { type: Type.STRING, enum: STATES },
          shirt: { type: Type.STRING, enum: STATES },
          at_cart: { type: Type.STRING, enum: STATES },
          why: {
            type: Type.STRING,
            description: "Only when an item is 'n'. A few words. Omit otherwise.",
          },
        },
        required: ["i", "cap", "apron", "shirt", "at_cart"],
      },
    },
  },
  required: ["results"],
};

/**
 * The instruction block is identical on every call and the images differ, so it
 * goes first: that is the ordering Gemini's implicit cache rewards, and it costs
 * nothing to get right even while the prompt is too short to reach the cache
 * threshold.
 */
function instructions(uniform: UniformSpec, count: number): string {
  return [
    "You are checking whether food-cart staff are wearing their uniform.",
    "",
    `The uniform is: ${uniform.promptNotes ?? "a cap or hairnet, an apron, and a company shirt"}`,
    "",
    `You will be given ${count} photo(s), each preceded by "Staff N:".`,
    "For each photo, report what you can actually see:",
    '  cap     - a cap or hairnet covering the hair',
    "  apron   - an apron worn over the clothing",
    "  shirt   - a shirt matching the uniform description above",
    "  at_cart - whether the surroundings look like a food cart or stall",
    "",
    'Answer "y" if clearly present, "n" if clearly absent, "?" if the photo',
    "cannot settle it — too dark, too far, cropped, or blurred.",
    "",
    'Use "?" freely. A wrong "y" lets an out-of-uniform shift through and a',
    'wrong "n" accuses someone who did nothing wrong; "?" is reviewed by a',
    "person, so it is the safe answer when you are unsure.",
    "",
    'Return one result per photo, with "i" set to that photo\'s staff number.',
  ].join("\n");
}

let client: GoogleGenAI | null = null;

function genai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: serverEnv.geminiApiKey });
  return client;
}

function asState(value: unknown): ItemState {
  return value === "y" || value === "n" ? value : "?";
}

/**
 * Judges a batch of photos in one request.
 *
 * Batching is what keeps the morning punch rush inside the request-per-minute
 * ceiling, and it amortises the instruction block across every photo in the
 * call rather than repeating it per staff member.
 */
export async function checkUniforms(
  subjects: CheckSubject[],
  uniform: UniformSpec,
): Promise<BatchResult> {
  if (subjects.length === 0) {
    return { observations: [], model: serverEnv.geminiModel, inputTokens: 0, outputTokens: 0 };
  }

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: instructions(uniform, subjects.length) },
  ];

  for (const subject of subjects) {
    // The label goes immediately before its image so the model has an anchor
    // for the index it has to echo back.
    parts.push({ text: `Staff ${subject.index}:` });
    parts.push({
      inlineData: {
        data: Buffer.from(subject.bytes).toString("base64"),
        mimeType: subject.mimeType,
      },
    });
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
      // The single biggest cost lever: reasoning tokens bill as output, and
      // "is a cap present" needs none.
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
      cap: asState(row.cap),
      apron: asState(row.apron),
      shirt: asState(row.shirt),
      atCart: asState(row.at_cart),
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

/**
 * Applies policy to observations.
 *
 * The model reports what it sees; which items are mandatory is a business rule
 * that belongs here, where it can change per cart without touching the prompt.
 */
export function verdictFor(
  observation: Observation,
  requiredItems: Record<string, boolean>,
): { verdict: "pass" | "fail" | "unclear"; items: Record<string, ItemState> } {
  const items: Record<string, ItemState> = {
    cap: observation.cap,
    apron: observation.apron,
    shirt: observation.shirt,
  };

  const required = Object.entries(items).filter(([name]) => requiredItems[name] !== false);

  if (required.some(([, state]) => state === "n")) {
    return { verdict: "fail", items };
  }
  if (required.some(([, state]) => state === "?")) {
    return { verdict: "unclear", items };
  }
  return { verdict: "pass", items };
}
