import { z } from "zod";

export const samplesSchema = z.object({
  samples: z.array(z.object({}).catchall(z.string())).min(1),
});

export type SamplesOutput = z.infer<typeof samplesSchema>;
