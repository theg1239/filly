import { z } from "zod";

const sampleValueSchema = z.union([z.string(), z.array(z.string())]);

export const samplesSchema = z.object({
  samples: z.array(z.object({}).catchall(sampleValueSchema)).min(1),
});

export type SamplesOutput = z.infer<typeof samplesSchema>;
