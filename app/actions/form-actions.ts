"use server";

import { eq, and, asc, inArray, isNotNull } from "@/lib/drizzle";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { formFields, forms, runItems, runs } from "@/lib/schema";
import type { FormField, ParsedForm, PreviewSample, RunRecord, RunSettings } from "@/lib/types";
import {
  parseGoogleForm,
  buildFormResponseUrl,
  buildViewFormUrl,
  parseFormId,
  extractFormMeta,
} from "@/lib/google-form";
import { generateSamples, normalizeSample, streamSampleElements } from "@/lib/ai";
import { enqueueRunBatch, enqueueRunPrepare } from "@/lib/qstash";

const requireDb = () => {
  const db = getDb();
  if (!db) {
    return null;
  }
  return db;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getUserId = () => "demo-user";

export const parseFormAction = async (url: string, formRecordId?: string) => {
  if (!url || !url.startsWith("http")) {
    return { ok: false as const, error: "Enter a valid Google Form URL." };
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };

  let targetUrl = url;
  let response = await fetch(targetUrl, { headers, cache: "no-store", redirect: "follow" });
  if (!response.ok && response.url) {
    targetUrl = response.url;
  } else if (response.url) {
    targetUrl = response.url;
  }
  if (!response.ok) {
    const parsed = parseFormId(targetUrl) ?? parseFormId(url);
    if (parsed) {
      const fallbackUrl = buildViewFormUrl(parsed.formId, parsed.formKind);
      response = await fetch(fallbackUrl, { headers, cache: "no-store", redirect: "follow" });
      if (response.url) {
        targetUrl = response.url;
      }
    }
  }

  if (!response.ok) {
    return {
      ok: false as const,
      error: `Failed to load the form URL (HTTP ${response.status}).`,
    };
  }

  const html = await response.text();
  let parsed: ParsedForm;

  try {
    parsed = parseGoogleForm(html, targetUrl);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not parse form metadata.",
    };
  }

  const fields = parsed.fields.map((field) => ({
    ...field,
    id: randomUUID(),
    enabled: field.enabled ?? true,
    strategy: field.strategy ?? "random",
    fixedValue: field.fixedValue ?? "",
    pattern: field.pattern ?? "",
  }));

  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  const formId = formRecordId ?? randomUUID();
  const userId = getUserId();

  await db.insert(forms).values({
    id: formId,
    userId,
    url,
    formId: parsed.formId,
    formKind: parsed.formKind,
    title: parsed.title,
    rawSchema: { ...parsed, fields } as unknown,
  });

  if (fields.length) {
    await db.insert(formFields).values(
      fields.map((field, index) => ({
        id: field.id,
        formId,
        entryId: field.entryId,
        label: field.label,
        type: field.type,
        options: field.options ?? null,
        required: field.required ?? false,
        order: index,
        config: {
          prompt: field.prompt ?? "",
          strategy: field.strategy ?? "random",
          fixedValue: field.fixedValue ?? "",
          pattern: field.pattern ?? "",
          enabled: field.enabled ?? true,
          validation: field.validation ?? null,
        },
      })),
    );
  }

  return {
    ok: true as const,
    form: { ...parsed, fields },
    formRecordId: formId,
  };
};

export const generatePreviewAction = async (fields: FormField[], count: number) => {
  if (!fields.length) {
    return { ok: false as const, error: "No fields available." };
  }

  const safeCount = Math.min(Math.max(count, 1), 10);
  try {
    const samples = await generateSamples(fields, safeCount);
    return { ok: true as const, samples };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to generate samples.",
    };
  }
};

export const startRunAction = async (
  formRecordId: string,
  form: ParsedForm,
  fields: FormField[],
  settings: RunSettings,
) => {
  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  if (!formRecordId) {
    return { ok: false as const, error: "Form record is missing." };
  }
  const runId = randomUUID();
  const count = Math.min(Math.max(settings.submissions, 1), 500);

  try {
    const updateFields = async (executor: { update: typeof db.update }) => {
      for (const [index, field] of fields.entries()) {
        try {
          await executor
            .update(formFields)
            .set({
              config: {
                prompt: field.prompt ?? "",
                strategy: field.strategy ?? "random",
                fixedValue: field.fixedValue ?? "",
                pattern: field.pattern ?? "",
                enabled: field.enabled ?? true,
                validation: field.validation ?? null,
              },
              order: index,
            })
            .where(eq(formFields.id, field.id));
        } catch (error) {
          console.error("form-field-update-item-failed", {
            fieldId: field.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }
    };

    if ("transaction" in db && typeof db.transaction === "function") {
      try {
        await db.transaction(async (tx) => {
          await updateFields(tx);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("No transactions support")) {
          await updateFields(db);
        } else {
          throw error;
        }
      }
    } else {
      await updateFields(db);
    }
  } catch (error) {
    console.error("form-field-update-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false as const,
      error: "Failed to update form fields.",
    };
  }

  await db.insert(runs).values({
    id: runId,
    formId: formRecordId,
    status: "preparing",
    count,
    rateLimit: Math.max(settings.rateLimit, 1),
    submitted: 0,
  });

  const items = Array.from({ length: count }).map((_, index) => ({
    id: randomUUID(),
    runId,
    index,
    status: "preparing",
  }));

  if (items.length) {
    await db.insert(runItems).values(items);
  }

  const run: RunRecord = {
    id: runId,
    formId: form.formId,
    formKind: form.formKind,
    status: "preparing",
    count,
    rateLimit: Math.max(settings.rateLimit, 1),
    submitted: 0,
    items: items.map((item) => ({
      id: item.id,
      index: item.index,
      status: "preparing",
    })),
    createdAt: Date.now(),
  };

  try {
    await enqueueRunPrepare(runId);
    await enqueueRunBatch(runId);
  } catch (error) {
    await db
      .update(runs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(runs.id, runId));
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to enqueue run.",
    };
  }

  return { ok: true as const, run };
};

export const prepareRunPayloadsAction = async (runId: string) => {
  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  if (!runId) {
    return { ok: false as const, error: "Run id is missing." };
  }

  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) {
    return { ok: false as const, error: "Run not found." };
  }
  if (run.status === "failed" || run.status === "completed") {
    return { ok: false as const, error: "Run is already finished." };
  }

  if (run.status === "failed" || run.status === "completed") {
    const failedItems = await db.query.runItems.findMany({
      where: and(eq(runItems.runId, runId), eq(runItems.status, "failed")),
      columns: { id: true },
    });
    return {
      ok: true as const,
      status: run.status as "completed" | "failed",
      failed: failedItems.length,
    };
  }

  const existingPayload = await db.query.runItems.findFirst({
    where: and(eq(runItems.runId, runId), isNotNull(runItems.payload)),
    columns: { id: true },
  });
  if (existingPayload) {
    return { ok: true as const };
  }

  const formRecord = await db.query.forms.findFirst({
    where: eq(forms.id, run.formId),
  });
  if (!formRecord) {
    return { ok: false as const, error: "Form record not found." };
  }

  let fieldRecords = await db.query.formFields.findMany({
    where: eq(formFields.formId, run.formId),
    orderBy: asc(formFields.order),
  });

  const viewUrl = buildViewFormUrl(
    formRecord.formId,
    (formRecord.formKind as "d" | "e") ?? "e",
  );
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  };
  try {
    const res = await fetch(viewUrl, { headers, cache: "no-store", redirect: "follow" });
    if (!res.ok) {
      throw new Error(`Failed to refresh form (HTTP ${res.status}).`);
    }
    const html = await res.text();
    const refreshed = parseGoogleForm(html, res.url || viewUrl);
    const normalizeLabel = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    const buckets = new Map<string, FormField[]>();
    const pushBucket = (key: string, field: FormField) => {
      const list = buckets.get(key) ?? [];
      list.push(field);
      buckets.set(key, list);
    };
    refreshed.fields.forEach((field) => {
      const labelKey = normalizeLabel(field.label);
      pushBucket(`${labelKey}|${field.type}`, field);
      pushBucket(`${labelKey}|*`, field);
    });

    const takeBucket = (key: string) => {
      const list = buckets.get(key);
      if (!list?.length) return null;
      return list.shift() ?? null;
    };

    const refreshedFields = fieldRecords.map((record, index) => {
      const labelKey = normalizeLabel(record.label);
      const match =
        takeBucket(`${labelKey}|${record.type}`) ||
        takeBucket(`${labelKey}|*`) ||
        refreshed.fields[index] ||
        null;
      if (!match) return record;
      return {
        ...record,
        entryId: match.entryId,
        label: match.label,
        type: match.type,
        options: match.options ?? null,
        required: match.required ?? false,
        validation: match.validation ?? null,
      };
    });

    await Promise.all(
      refreshedFields.map((record) =>
        db
          .update(formFields)
          .set({
            entryId: record.entryId,
            label: record.label,
            type: record.type,
            options: record.options,
            required: record.required ?? false,
            config: {
              ...((record.config as Record<string, unknown> | null) ?? {}),
              validation: (record as { validation?: FormField["validation"] | null }).validation ?? null,
            },
          })
          .where(eq(formFields.id, record.id)),
      ),
    );

    await db
      .update(forms)
      .set({
        title: refreshed.title,
        rawSchema: {
          ...(formRecord.rawSchema as Record<string, unknown>),
          meta: refreshed.meta,
        },
      })
      .where(eq(forms.id, formRecord.id));

    fieldRecords = refreshedFields;
  } catch (error) {
    console.error("form-refresh-failed", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(runs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(runs.id, runId));
    return {
      ok: false as const,
      error: "Failed to refresh the form before generating samples.",
    };
  }

  const fields: FormField[] = fieldRecords.map((record) => ({
    id: record.id,
    entryId: record.entryId,
    label: record.label,
    type: record.type as FormField["type"],
    options: (record.options as string[] | null) ?? undefined,
    required: record.required ?? false,
    prompt: (record.config as { prompt?: string } | null)?.prompt ?? "",
    strategy: (record.config as { strategy?: FormField["strategy"] } | null)?.strategy ?? "random",
    fixedValue: (record.config as { fixedValue?: string } | null)?.fixedValue ?? "",
    pattern: (record.config as { pattern?: string } | null)?.pattern ?? "",
    enabled: (record.config as { enabled?: boolean } | null)?.enabled ?? true,
    validation:
      (record as { validation?: FormField["validation"] | null }).validation ??
      (record.config as { validation?: FormField["validation"] } | null)?.validation ??
      undefined,
  }));

  const items = await db.query.runItems.findMany({
    where: eq(runItems.runId, runId),
    orderBy: asc(runItems.index),
  });

  if (!items.length) {
    return { ok: false as const, error: "No run items found." };
  }

  await db
    .update(runs)
    .set({ status: "preparing", startedAt: new Date() })
    .where(eq(runs.id, runId));

  const count = items.length;
  const hasApiKey =
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.AI_GATEWAY_API_KEY) ||
    Boolean(process.env.AI_GATEWAY_URL);

  if (!hasApiKey) {
    await db
      .update(runs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(runs.id, runId));
    return { ok: false as const, error: "AI credentials are missing." };
  }

  try {
    const { result } = streamSampleElements(fields, count);
    let prepared = 0;
    for await (const sample of result.elementStream) {
      const item = items[prepared];
      if (!item) break;
      const normalized = normalizeSample(sample, fields);
      await db
        .update(runItems)
        .set({ payload: normalized, status: "queued" })
        .where(eq(runItems.id, item.id));
      prepared += 1;
    }

    if (prepared < count) {
      throw new Error(`AI returned ${prepared} samples for ${count} items.`);
    }
  } catch (error) {
    console.error("payload-generation-error", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(runs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(runs.id, runId));
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Payload generation failed.",
    };
  }

  await db.update(runs).set({ status: "queued" }).where(eq(runs.id, runId));
  return { ok: true as const };
};

export const getFormRecordAction = async (formRecordId: string) => {
  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  if (!formRecordId) {
    return { ok: false as const, error: "Form record id is missing." };
  }

  const formRecord = await db.query.forms.findFirst({
    where: eq(forms.id, formRecordId),
  });

  if (!formRecord) {
    return { ok: false as const, error: "Form record not found." };
  }

  const fieldRecords = await db.query.formFields.findMany({
    where: eq(formFields.formId, formRecordId),
    orderBy: asc(formFields.order),
  });

  const fields: FormField[] = fieldRecords.map((record) => {
    const config =
      (record.config as {
        prompt?: string;
        strategy?: FormField["strategy"];
        fixedValue?: string;
        pattern?: string;
        enabled?: boolean;
        validation?: FormField["validation"];
      } | null) ?? { enabled: true };

    return {
      id: record.id,
      entryId: record.entryId,
      label: record.label,
      type: record.type as FormField["type"],
      options: (record.options as string[] | null) ?? undefined,
      required: record.required ?? false,
      prompt: config.prompt ?? "",
      strategy: config.strategy ?? "random",
      fixedValue: config.fixedValue ?? "",
      pattern: config.pattern ?? "",
      enabled: config.enabled ?? true,
      validation: config.validation ?? undefined,
    } satisfies FormField;
  });

  return {
    ok: true as const,
    form: {
      url: formRecord.url,
      loaded: true,
      title: formRecord.title ?? "Loaded form",
      recordId: formRecord.id,
      formId: formRecord.formId,
      formKind: (formRecord.formKind as "d" | "e") ?? "e",
      fields,
    },
  };
};

export const processRunBatchAction = async (runId: string, batchSize = 3) => {
  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });

  if (!run) {
    return { ok: false as const, error: "Run not found." };
  }

  await db
    .update(runItems)
    .set({ status: "queued" })
    .where(
      and(
        eq(runItems.runId, runId),
        eq(runItems.status, "preparing"),
        isNotNull(runItems.payload),
      ),
    );

  let pendingItems = await db.query.runItems.findMany({
    where: and(
      eq(runItems.runId, runId),
      eq(runItems.status, "queued"),
      isNotNull(runItems.payload),
    ),
    orderBy: asc(runItems.index),
    limit: batchSize,
  });

  if (!pendingItems.length) {
    const preparedItems = await db.query.runItems.findMany({
      where: and(eq(runItems.runId, runId), isNotNull(runItems.payload)),
      columns: { id: true },
    });
    const prepared = preparedItems.length;
    if (prepared < run.count) {
      return {
        ok: true as const,
        status: "preparing" as const,
        prepared,
        submitted: run.submitted,
        failed: 0,
        nextDelayMs: 1000,
      };
    }

    const allItems = await db.query.runItems.findMany({
      where: eq(runItems.runId, runId),
      columns: { status: true },
    });
    const statusCounts = allItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    console.info("run-batch-empty", { runId, statusCounts });
    const completedItems = await db.query.runItems.findMany({
      where: and(eq(runItems.runId, runId), eq(runItems.status, "completed")),
      columns: { id: true },
    });
    const failedItems = await db.query.runItems.findMany({
      where: and(eq(runItems.runId, runId), eq(runItems.status, "failed")),
      columns: { id: true },
    });
    const submitted = completedItems.length;
    const failed = failedItems.length;
    const status = failed ? "failed" : "completed";
    await db
      .update(runs)
      .set({ status, finishedAt: new Date(), submitted })
      .where(eq(runs.id, runId));
    return {
      ok: true as const,
      status: status as "completed" | "failed",
      failed,
      submitted,
    };
  }

  const formRecord = await db.query.forms.findFirst({
    where: eq(forms.id, run.formId),
  });

  if (!formRecord) {
    return { ok: false as const, error: "Form record not found." };
  }

  const fieldRecords = await db.query.formFields.findMany({
    where: eq(formFields.formId, run.formId),
    orderBy: asc(formFields.order),
  });

  const fields: FormField[] = fieldRecords.map((record) => ({
    id: record.id,
    entryId: record.entryId,
    label: record.label,
    type: record.type as FormField["type"],
    options: (record.options as string[] | null) ?? undefined,
    required: record.required ?? false,
    prompt: (record.config as { prompt?: string } | null)?.prompt ?? "",
    strategy: (record.config as { strategy?: FormField["strategy"] } | null)?.strategy ?? "random",
    fixedValue: (record.config as { fixedValue?: string } | null)?.fixedValue ?? "",
    pattern: (record.config as { pattern?: string } | null)?.pattern ?? "",
    enabled: (record.config as { enabled?: boolean } | null)?.enabled ?? true,
    validation:
      (record as { validation?: FormField["validation"] | null }).validation ??
      (record.config as { validation?: FormField["validation"] } | null)?.validation ??
      undefined,
  }));

  pendingItems = await db.query.runItems.findMany({
    where: and(
      eq(runItems.runId, runId),
      eq(runItems.status, "queued"),
      isNotNull(runItems.payload),
    ),
    orderBy: asc(runItems.index),
    limit: batchSize,
  });
  let meta =
    (formRecord.rawSchema as { meta?: ParsedForm["meta"] } | null)?.meta ?? {};
  const fallbackViewUrl = buildViewFormUrl(
    formRecord.formId,
    (formRecord.formKind as "d" | "e") ?? "e",
  );
  const viewUrl = meta.viewUrl || fallbackViewUrl;

  let freshRequiredEntryIds: string[] = [];
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const res = await fetch(viewUrl, {
      headers,
      cache: "no-store",
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      const freshParsed = parseGoogleForm(html, res.url || viewUrl);
      const freshMeta = extractFormMeta(html, res.url || viewUrl);
      meta = { ...meta, ...freshMeta, ...freshParsed.meta };
      freshRequiredEntryIds = freshParsed.fields
        .filter((field) => field.required)
        .map((field) => field.entryId);
      await db
        .update(forms)
        .set({
          rawSchema: {
            ...(formRecord.rawSchema as Record<string, unknown>),
            meta,
          },
        })
        .where(eq(forms.id, formRecord.id));
    }
  } catch (error) {
    console.error("form-meta-refresh-failed", {
      runId,
      formId: formRecord.formId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const formUrl =
    meta.actionUrl ||
    buildFormResponseUrl(
      formRecord.formId,
      (formRecord.formKind as "d" | "e") ?? "e",
    );
  const referer = meta.fbzx
    ? `${viewUrl}?fbzx=${encodeURIComponent(meta.fbzx)}`
    : viewUrl;
  const delayMs = Math.max(1000 / run.rateLimit, 150);
  const nextDelayMs = Math.max(500, delayMs * pendingItems.length);

  await db
    .update(runItems)
    .set({ status: "running" })
    .where(inArray(runItems.id, pendingItems.map((item) => item.id)));

  let submitted = run.submitted;

  for (const [index, item] of pendingItems.entries()) {
    const payload = (item.payload as PreviewSample | null) ?? {};
    const submissionTimestamp = String(Date.now());
    const fullPayload: Record<string, string | string[]> = {
      ...payload,
      ...(meta.dlut ? { dlut: meta.dlut } : {}),
      ...(meta.hud ? { hud: meta.hud } : {}),
      ...(meta.fvv ? { fvv: meta.fvv } : {}),
      ...(meta.partialResponse ? { partialResponse: meta.partialResponse } : {}),
      ...(meta.pageHistory ? { pageHistory: meta.pageHistory } : {}),
      ...(meta.token ? { token: meta.token } : {}),
      ...(meta.tag ? { tag: meta.tag } : {}),
      ...(meta.fbzx ? { fbzx: meta.fbzx } : {}),
      ...(submissionTimestamp ? { submissionTimestamp } : {}),
    };
    const formParams = new URLSearchParams();
    for (const [key, value] of Object.entries(fullPayload)) {
      if (Array.isArray(value)) {
        value
          .map((entry) => (entry == null ? "" : String(entry)))
          .filter((entry) => entry.trim().length > 0)
          .forEach((entry) => formParams.append(key, entry));
      } else if (value != null) {
        formParams.append(key, String(value));
      }
    }
    try {
      const res = await fetch(formUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://docs.google.com",
          Referer: referer,
        },
        redirect: "manual",
        body: formParams.toString(),
      });
      const responseText = await res.text();
      const redirected = res.status >= 300 && res.status < 400;
      const stripScript = /<script[\s\S]*?<\/script>/gi;
      const stripStyle = /<style[\s\S]*?<\/style>/gi;
      const visibleText = responseText.replace(stripScript, "").replace(stripStyle, "");
      const successText =
        /your response has been recorded|thanks for submitting|thank you/i.test(visibleText);
      const hasFormAction = /<form[^>]*action=["'][^"']*\/formResponse/i.test(responseText);
      const accepted = redirected || (res.ok && successText && !hasFormAction);
      const errorSnippets = Array.from(
        responseText.matchAll(/role=["']alert["'][^>]*>([^<]{1,160})</gi),
      )
        .map((match) => match[1].trim())
        .filter(Boolean)
        .slice(0, 3);
      const validationMatch = visibleText.match(
        /(required question|please enter|please select|must be|invalid)/i,
      );
      const validationMessage = errorSnippets[0] ?? (validationMatch ? validationMatch[0] : null);
      const payloadRecord = fullPayload as Record<string, string | string[]>;
      const missingEntryIds = freshRequiredEntryIds.filter(
        (entryId) => !Object.prototype.hasOwnProperty.call(payloadRecord, `entry.${entryId}`),
      );
      const hasValue = (value: string | string[] | undefined) => {
        if (Array.isArray(value)) {
          return value.some((entry) => String(entry ?? "").trim().length > 0);
        }
        return String(value ?? "").trim().length > 0;
      };
      const emptyRequired = fields
        .filter((field) => field.required)
        .map((field) => {
          const key = `entry.${field.entryId}`;
          const value = payloadRecord[key];
          return hasValue(value) ? null : `${field.label} (${key})`;
        })
        .filter(Boolean);
      const errorMessage =
        accepted
          ? null
          : res.status === 401
            ? "Unauthorized (form requires sign-in)"
            : res.ok
              ? hasFormAction
                ? "Response returned input form"
                : "Response not accepted"
              : `HTTP ${res.status}`;

      const payloadPreview = Object.fromEntries(
        Object.entries(fullPayload)
          .filter(([key]) => key.startsWith("entry."))
          .slice(0, 5)
          .map(([key, value]) => {
            if (Array.isArray(value)) {
              return [key, value.map((entry) => String(entry)).join(", ").slice(0, 120)];
            }
            return [key, String(value).slice(0, 120)];
          }),
      );

      if (!accepted) {
        console.error("form-submit-rejected", {
          runId,
          itemId: item.id,
          status: res.status,
          formId: formRecord.formId,
          formKind: formRecord.formKind,
          redirected,
          successText,
          hasFormAction,
          location: res.headers.get("location"),
          validationMessage,
          missingEntryIds,
          emptyRequired,
          errorSnippets,
          payloadKeys: Object.keys(fullPayload),
          payloadPreview,
          bodyPreview: responseText.slice(0, 200),
        });
      } else if (index === 0) {
        console.info("form-submit-accepted", {
          runId,
          itemId: item.id,
          status: res.status,
          redirected,
          successText,
          hasFormAction,
          location: res.headers.get("location"),
          validationMessage,
          missingEntryIds,
          emptyRequired,
          errorSnippets,
          payloadPreview,
          bodyPreview: responseText.slice(0, 200),
        });
      }

      await db
        .update(runItems)
        .set({
          status: accepted ? "completed" : "failed",
          payload: fullPayload,
          response: {
            status: res.status,
            accepted,
            redirected,
            successText,
            hasFormAction,
            location: res.headers.get("location"),
            validationMessage,
            missingEntryIds,
            emptyRequired,
            errorSnippets,
            bodyPreview: responseText.slice(0, 200),
          },
          error: errorMessage,
          completedAt: new Date(),
        })
        .where(eq(runItems.id, item.id));
      if (accepted) {
        submitted += 1;
      }
    } catch (error) {
      console.error("form-submit-error", {
        runId,
        itemId: item.id,
        formId: formRecord.formId,
        formKind: formRecord.formKind,
        error: error instanceof Error ? error.message : String(error),
      });
      await db
        .update(runItems)
        .set({
          status: "failed",
          payload: fullPayload,
          error: error instanceof Error ? error.message : "Request failed",
          completedAt: new Date(),
        })
        .where(eq(runItems.id, item.id));
    }

    await sleep(delayMs);
  }

  const failedItems = await db.query.runItems.findMany({
    where: and(eq(runItems.runId, runId), eq(runItems.status, "failed")),
    columns: { id: true },
  });

  await db
    .update(runs)
    .set({ status: "running", submitted })
    .where(eq(runs.id, runId));

  return {
    ok: true as const,
    status: "running" as const,
    submitted,
    failed: failedItems.length,
    nextDelayMs,
  };
};

export const getRunStatusAction = async (runId: string) => {
  const db = requireDb();
  if (!db) {
    return { ok: false as const, error: "DATABASE_URL is required." };
  }
  if (!runId) {
    return { ok: false as const, error: "Run id is missing." };
  }

  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
  if (!run) {
    return { ok: false as const, error: "Run not found." };
  }

  const failedItems = await db.query.runItems.findMany({
    where: and(eq(runItems.runId, runId), eq(runItems.status, "failed")),
    columns: { id: true },
  });
  const preparedItems = await db.query.runItems.findMany({
    where: and(eq(runItems.runId, runId), isNotNull(runItems.payload)),
    columns: { id: true },
  });

  return {
    ok: true as const,
    status: (run.status as RunRecord["status"]) ?? "queued",
    submitted: run.submitted,
    failed: failedItems.length,
    prepared: preparedItems.length,
  };
};
