import { Output, generateText, streamText, gateway } from "ai";
import { openai } from "@ai-sdk/openai";
import type { FormField, PreviewSample } from "./types";
import { z } from "zod";

const hasAiConfig = () =>
  Boolean(process.env.OPENAI_API_KEY) ||
  Boolean(process.env.AI_GATEWAY_API_KEY) ||
  Boolean(process.env.AI_GATEWAY_URL);

const requireAiConfig = () => {
  if (!hasAiConfig()) {
    throw new Error("AI credentials are missing.");
  }
};

export const getModel = () => {
  requireAiConfig();
  if (process.env.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_URL) {
    return gateway(process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5-mini");
  }
  return openai(process.env.OPENAI_MODEL ?? "gpt-5.2");
};

const fieldDescriptor = (field: FormField) => {
  const parts = [`${field.label} [${field.type}]`];

  if (field.options?.length) {
    parts.push(`options: ${field.options.join(" | ")}`);
  }
  if (field.required) {
    parts.push("required");
  }
  if (field.strategy === "fixed" && field.fixedValue) {
    parts.push(`fixed value: ${field.fixedValue}`);
  }
  if (field.strategy === "pattern" && field.pattern) {
    parts.push(`pattern: ${field.pattern}`);
  }
  if (field.validation?.message) {
    parts.push(`validation: ${field.validation.message}`);
  }
  if (field.validation?.raw) {
    parts.push(`validation data: ${JSON.stringify(field.validation.raw)}`);
  }
  if (field.helpText) {
    parts.push(`help: ${field.helpText}`);
  }
  if (field.prompt) {
    parts.push(`instruction: ${field.prompt}`);
  }

  return parts.join(". ");
};

export const buildSamplesPrompt = (fields: FormField[], count: number) => {
  const activeFields = fields.filter((field) => field.enabled !== false);

  return `You are generating Google Form submissions.
Return JSON with a "samples" array. Each object must use ONLY these keys:
${activeFields.map((field) => `- entry.${field.entryId}: ${fieldDescriptor(field)}`).join("\n")}

Guidelines:
- Keep values realistic and concise.
- Use provided options when present.
- If a field has options, choose one of the options exactly (checkboxes may return multiple).
- Required fields must never be blank.
- For checkbox fields, return an array of option values (a single option is acceptable).
- Do not invent new keys.
- Every sample must include every key listed above.
- Return exactly ${count} samples. If unsure, repeat a previous sample rather than returning fewer.
`;
};

export const buildSampleKeys = (fields: FormField[]) =>
  fields
    .filter((field) => field.enabled !== false)
    .map((field) => `entry.${field.entryId}`);

export const hasAllSampleKeys = (sample: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => Object.prototype.hasOwnProperty.call(sample, key));

const buildOptionSchema = (options: string[]) => {
  const unique = Array.from(new Set(options.map((value) => value.trim()).filter(Boolean)));
  if (unique.length === 0) return z.string();
  if (unique.length === 1) return z.literal(unique[0]);
  return z.enum(unique as [string, ...string[]]);
};

const buildStringSchema = (field: FormField) => {
  let schema = z.string();
  if (field.required) {
    schema = schema.min(1);
  }
  if (field.pattern) {
    try {
      const pattern = new RegExp(field.pattern);
      schema = schema.regex(pattern);
    } catch {
      // ignore invalid patterns
    }
  }
  return schema;
};

const buildFieldSchema = (field: FormField) => {
  if (field.options?.length) {
    const optionSchema = buildOptionSchema(field.options);
    if (field.type === "checkbox") {
      const arraySchema = z.array(optionSchema);
      return field.required ? z.union([optionSchema, arraySchema.min(1)]) : z.union([optionSchema, arraySchema]);
    }
    return optionSchema;
  }
  return buildStringSchema(field);
};

export const buildSamplesSchema = (fields: FormField[], count: number) => {
  const activeFields = fields.filter((field) => field.enabled !== false);
  const entryShape = Object.fromEntries(
    activeFields.map((field) => [`entry.${field.entryId}`, buildFieldSchema(field)]),
  );
  return z.object({
    samples: z.array(z.object(entryShape).strict()).length(count),
  });
};

export const buildSampleElementSchema = (fields: FormField[]) => {
  const activeFields = fields.filter((field) => field.enabled !== false);
  const entryShape = Object.fromEntries(
    activeFields.map((field) => [`entry.${field.entryId}`, buildFieldSchema(field)]),
  );
  return z.object(entryShape).strict();
};

const applyOverrides = (sample: PreviewSample, fields: FormField[]) => {
  const updated = { ...sample };

  fields.forEach((field) => {
    if (field.strategy === "fixed" && field.fixedValue) {
      updated[`entry.${field.entryId}`] = field.fixedValue;
    }
  });

  return updated;
};

export const normalizeSample = (
  sample: Record<string, unknown>,
  fields: FormField[],
) => {
  const normalized = Object.fromEntries(
    Object.entries(sample).map(([key, value]) => {
      if (value == null) return [key, ""];
      if (Array.isArray(value)) {
        return [key, value.map((entry) => (entry == null ? "" : String(entry)))];
      }
      return [key, String(value)];
    }),
  );
  const withOverrides = applyOverrides(normalized, fields);
  return { ...withOverrides };
};

export const streamSamples = (fields: FormField[], count: number) => {
  const activeFields = fields.filter((field) => field.enabled !== false);
  const prompt = buildSamplesPrompt(activeFields, count);
  const schema = buildSamplesSchema(activeFields, count);

  return {
    activeFields,
    result: streamText({
      model: getModel(),
      output: Output.object({ schema }),
      prompt,
    }),
  };
};

export const streamSampleElements = (fields: FormField[], count: number) => {
  const activeFields = fields.filter((field) => field.enabled !== false);
  const prompt = buildSamplesPrompt(activeFields, count);
  const element = buildSampleElementSchema(activeFields);
  const result = streamText({
    model: getModel(),
    output: Output.array({ element }),
    prompt,
    onError({ error }) {
      console.error("sample element stream error", error);
    },
  });

  return { activeFields, result };
};

const generateSamplesOnce = async (
  activeFields: FormField[],
  count: number,
): Promise<PreviewSample[]> => {
  const requiredKeys = buildSampleKeys(activeFields);
  const prompt = buildSamplesPrompt(activeFields, count);
  const schema = buildSamplesSchema(activeFields, count);
  const result = await generateText({
    model: getModel(),
    output: Output.object({ schema }),
    prompt,
  });
  const samples = (result.output.samples ?? []).slice(0, count);
  if (samples.length < count) {
    console.error("ai-samples-missing-count", {
      expected: count,
      received: samples.length,
      requiredKeys,
      samplePreview: samples.slice(0, 2),
    });
    throw new Error("AI returned fewer samples than requested.");
  }
  const normalized = samples.map((sample) => normalizeSample(sample, activeFields));
  const invalid = normalized.find((sample) => !hasAllSampleKeys(sample, requiredKeys));
  if (invalid) {
    console.error("ai-samples-missing-keys", {
      requiredKeys,
      samplePreview: invalid,
    });
    throw new Error("AI response missing required fields.");
  }
  return normalized;
};

export const generateSamples = async (
  fields: FormField[],
  count: number,
): Promise<PreviewSample[]> => {
  const activeFields = fields.filter((field) => field.enabled !== false);
  requireAiConfig();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await generateSamplesOnce(activeFields, count);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("AI generation failed.");
    }
  }
  throw lastError ?? new Error("AI generation failed.");
};
