import { Realtime, type InferRealtimeEvents } from "@upstash/realtime";
import { z } from "zod";
import { redis } from "./redis";

const runStatusSchema = z.object({
  runId: z.string(),
  status: z.enum(["idle", "queued", "preparing", "running", "completed", "failed"]),
  submitted: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  prepared: z.number().nonnegative().optional(),
});

const schema = {
  run: {
    status: runStatusSchema,
  },
};

export const realtime = new Realtime({
  schema,
  redis,
  maxDurationSecs: 25,
});

export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
export type RunStatusPayload = z.infer<typeof runStatusSchema>;

export const emitRunStatus = async (payload: RunStatusPayload) => {
  try {
    await realtime.channel(`run-${payload.runId}`).emit("run.status", payload);
  } catch (error) {
    console.error("realtime-emit-failed", {
      runId: payload.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
