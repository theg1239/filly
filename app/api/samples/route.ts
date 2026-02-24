import { Output, streamText } from "ai";
import type { FormField } from "@/lib/types";
import { buildSamplesPrompt, buildSamplesSchema, getModel } from "@/lib/ai";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const fields = (payload?.fields as FormField[]) ?? [];
  const requested = Number(payload?.count ?? 3);
  const count = Math.min(Math.max(requested, 1), 10);

  if (!fields.length) {
    return new Response("No fields provided.", { status: 400 });
  }

  const hasApiKey =
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.AI_GATEWAY_API_KEY) ||
    Boolean(process.env.AI_GATEWAY_URL);

  if (!hasApiKey) {
    return new Response("AI credentials are missing.", { status: 500 });
  }

  const prompt = buildSamplesPrompt(fields, count);
  const schema = buildSamplesSchema(fields, count);
  const result = streamText({
    model: getModel(),
    output: Output.object({ schema }),
    prompt,
    onError({ error }) {
      console.error("sample stream error", error);
    },
  });

  return result.toTextStreamResponse();
}
