import { Client, Receiver } from "@upstash/qstash";

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

export const getQstashClient = () =>
  new Client({ token: requireEnv(process.env.QSTASH_TOKEN, "QSTASH_TOKEN") });

export const getQstashBaseUrl = () => {
  const baseUrl = requireEnv(process.env.QSTASH_BASE_URL, "QSTASH_BASE_URL");
  return baseUrl.replace(/\/$/, "");
};

export const getQstashReceiver = () =>
  new Receiver({
    currentSigningKey: requireEnv(
      process.env.QSTASH_CURRENT_SIGNING_KEY,
      "QSTASH_CURRENT_SIGNING_KEY",
    ),
    nextSigningKey: requireEnv(
      process.env.QSTASH_NEXT_SIGNING_KEY,
      "QSTASH_NEXT_SIGNING_KEY",
    ),
  });

export const buildQstashUrl = (path: string) => {
  const baseUrl = getQstashBaseUrl();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

export const enqueueRunPrepare = async (runId: string, delayMs?: number) => {
  const client = getQstashClient();
  const delaySeconds = delayMs ? Math.max(1, Math.ceil(delayMs / 1000)) : 0;
  await client.publishJSON({
    url: buildQstashUrl("/api/qstash/prepare"),
    body: { runId },
    ...(delaySeconds ? { delay: delaySeconds } : {}),
  });
};

export const enqueueRunBatch = async (runId: string, delayMs?: number) => {
  const client = getQstashClient();
  const delaySeconds = delayMs ? Math.max(1, Math.ceil(delayMs / 1000)) : 0;
  await client.publishJSON({
    url: buildQstashUrl("/api/qstash/run"),
    body: { runId },
    ...(delaySeconds ? { delay: delaySeconds } : {}),
  });
};

export const verifyQstashSignature = async (
  signature: string | null,
  body: string,
) => {
  if (!signature) return false;
  const receiver = getQstashReceiver();
  return receiver.verify({ signature, body });
};
