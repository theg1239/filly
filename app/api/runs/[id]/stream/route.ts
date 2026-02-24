import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "@/lib/drizzle";
import { getDb } from "@/lib/db";
import { runItems, runs } from "@/lib/schema";

const jsonEvent = (payload: unknown) =>
  `event: status\ndata: ${JSON.stringify(payload)}\n\n`;

const fetchRunStatus = async (runId: string) => {
  const db = getDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }

  const [run] = await db
    .select({ status: runs.status, submitted: runs.submitted })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) {
    return { ok: false as const, error: "Run not found." };
  }

  const failedItems = await db
    .select({ id: runItems.id })
    .from(runItems)
    .where(and(eq(runItems.runId, runId), eq(runItems.status, "failed")));
  const preparedItems = await db
    .select({ id: runItems.id })
    .from(runItems)
    .where(and(eq(runItems.runId, runId), isNotNull(runItems.payload)));

  return {
    ok: true as const,
    status: run.status,
    submitted: run.submitted,
    failed: failedItems.length,
    prepared: preparedItems.length,
  };
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const runId = id;
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Run id is missing." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(jsonEvent(payload)));
        } catch {
          closed = true;
          if (interval) clearInterval(interval);
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const status = await fetchRunStatus(runId);
          safeEnqueue(status);
          if (status.ok && (status.status === "completed" || status.status === "failed")) {
            closed = true;
            if (interval) clearInterval(interval);
            try {
              controller.close();
            } catch {
              // noop
            }
          }
        } catch (error) {
          safeEnqueue({
            ok: false,
            error: error instanceof Error ? error.message : "Stream error.",
          });
          closed = true;
          if (interval) clearInterval(interval);
          try {
            controller.close();
          } catch {
            // noop
          }
        }
      };

      tick();
      interval = setInterval(tick, 1500);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
