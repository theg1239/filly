import { NextResponse } from "next/server";
import { prepareRunPayloadsAction } from "@/app/actions/form-actions";
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

    console.info("qstash-prepare-start", { runId: payload.runId });
    const result = await prepareRunPayloadsAction(payload.runId);
    if (!result.ok) {
      console.error("qstash-prepare-failed", { runId: payload.runId, error: result.error });
      return NextResponse.json(result, { status: 200 });
    }

    await enqueueRunBatch(payload.runId);
    console.info("qstash-prepare-complete", { runId: payload.runId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
};
