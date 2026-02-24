import { NextResponse } from "next/server";
import { processRunBatchAction } from "@/app/actions/form-actions";
import { enqueueRunBatch, verifyQstashSignature } from "@/lib/qstash";

export const POST = async (req: Request) => {
  try {
    const body = await req.text();
    const signature = req.headers.get("Upstash-Signature");
    const verified = await verifyQstashSignature(signature, body);

    if (!verified) {
      return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    let payload: { runId?: string };
    try {
      payload = JSON.parse(body) as { runId?: string };
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    }

    if (!payload.runId) {
      return NextResponse.json({ ok: false, error: "Run id is missing." }, { status: 400 });
    }

    console.info("qstash-run-start", { runId: payload.runId });
    const result = await processRunBatchAction(payload.runId, 3);
    if (!result.ok) {
      console.error("qstash-run-failed", { runId: payload.runId, error: result.error });
      return NextResponse.json(result, { status: 200 });
    }

    if (result.status === "running" || result.status === "preparing") {
      await enqueueRunBatch(payload.runId, result.nextDelayMs ?? 1000);
    }

    console.info("qstash-run-complete", {
      runId: payload.runId,
      status: result.status,
      submitted: result.submitted,
      failed: result.failed,
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
};
