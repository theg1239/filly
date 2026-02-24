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
  maxDurationSecs: 90,
  verbose: process.env.NODE_ENV !== "production",
});

export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
export type RunStatusPayload = z.infer<typeof runStatusSchema>;

export const emitRunStatus = async (payload: RunStatusPayload) => {
  const parsed = runStatusSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("realtime-payload-invalid", {
      runId: payload.runId,
      issues: parsed.error.issues,
    });
    return;
  }

  if (!redis) {
    console.error("realtime-redis-missing", { runId: payload.runId });
    return;
  }

  const channel = `run-${payload.runId}`;
  const fallbackId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let eventId = fallbackId;

  try {
    try {
      const streamId = await redis.xadd(channel, "*", {
        channel,
        event: "run.status",
        data: payload,
      });
      if (streamId) {
        eventId = streamId;
      }
    } catch (error) {
      console.warn("realtime-xadd-failed", {
        runId: payload.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await redis.publish(channel, {
      id: eventId,
      channel,
      event: "run.status",
      data: payload,
    });
    if (process.env.NODE_ENV !== "production") {
      console.info("realtime-emit", {
        runId: payload.runId,
        status: payload.status,
        submitted: payload.submitted,
        failed: payload.failed,
        prepared: payload.prepared,
        eventId,
      });
    }
  } catch (error) {
    console.error("realtime-emit-failed", {
      runId: payload.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
