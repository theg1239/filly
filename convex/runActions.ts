"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { FormField, PreviewSample } from "../lib/types";
import type { Id } from "./_generated/dataModel";
import {
  buildFormResponseUrl,
  buildViewFormUrl,
  fetchFormHtml,
  normalizeFields,
  parseGoogleForm,
  reconcileFields,
} from "../lib/forms";
import {
  analyzeSubmissionResponse,
  buildSubmissionPayload,
  getEmptyRequiredLabels,
  getMissingEntryIds,
  getRequiredEntryIds,
  toFormParams,
} from "../lib/forms/submit";
import { generateSamples } from "../lib/ai";

const withTimeout = <T,>(promise: Promise<T>, ms: number, message = "Operation timed out") =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);

const generateSamplesWithFallback = async (
  fields: FormField[],
  count: number,
  runId: Id<"runs">,
) => {
  try {
    return await withTimeout(generateSamples(fields, count), 90000, "Sample generation timed out");
  } catch (error) {
    console.error("ai-samples-failed", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error("AI sample generation failed.");
  }
};

const buildFieldSnapshot = (field: {
  id: Id<"formFields">;
  entryId: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  helpText?: string;
  rawType?: number | null;
  config?: Record<string, unknown> | null;
  validation?: unknown;
}): FormField => ({
  id: field.id as unknown as string,
  entryId: field.entryId,
  label: field.label,
  type: field.type as FormField["type"],
  options: field.options ?? undefined,
  required: field.required ?? false,
  helpText: field.helpText ?? null,
  rawType: field.rawType ?? null,
  prompt: (field.config as { prompt?: string } | null)?.prompt ?? "",
  strategy: (field.config as { strategy?: FormField["strategy"] } | null)?.strategy ?? "random",
  fixedValue: (field.config as { fixedValue?: string } | null)?.fixedValue ?? "",
  pattern: (field.config as { pattern?: string } | null)?.pattern ?? "",
  enabled: (field.config as { enabled?: boolean } | null)?.enabled ?? true,
  validation:
    (field.validation as FormField["validation"]) ??
    (field.config as { validation?: FormField["validation"] } | null)?.validation ??
    undefined,
});

export const prepareRun: ReturnType<typeof action> = action({
  args: { runId: v.id("runs") },
  returns: v.object({ ok: v.boolean(), status: v.string(), error: v.optional(v.string()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; status: string; error?: string }> => {
    const run = await ctx.runQuery(api.runs.getRun, { runId: args.runId });
    if (!run) {
      return { ok: false, status: "failed", error: "Run not found." };
    }

    const activeRun = await ctx.runQuery(api.runs.getFormActiveRun, { formId: run.formId });
    if (activeRun?.activeRunId && activeRun.activeRunId !== run.id) {
      const message = "Run superseded by another active run.";
      await ctx.runMutation(api.runs.setRunStatusOnly, {
        runId: args.runId,
        status: "failed",
        error: message,
      });
      return { ok: false, status: "failed", error: message };
    }

    if (run.status === "completed" || run.status === "failed") {
      return { ok: true, status: run.status };
    }

    const snapshot = await ctx.runQuery(api.runs.getFormSnapshot, { formId: run.formId });
    const storedFields = snapshot.fields.map(buildFieldSnapshot);

    const shouldRefresh = run.prepared === 0;
    let reconciled = storedFields;

    try {
      if (shouldRefresh) {
        const viewUrl = buildViewFormUrl(snapshot.form.formId, snapshot.form.formKind);
        const { html, url } = await withTimeout(
          fetchFormHtml(viewUrl),
          15000,
          "Form refresh timed out",
        );
        const refreshed = parseGoogleForm(html, url);
        const normalizedRefreshed = normalizeFields(refreshed.fields);
        reconciled = reconcileFields(storedFields, normalizedRefreshed);

        await ctx.runMutation(api.forms.refreshFormMeta, {
          formId: snapshot.form.id,
          title: refreshed.title,
          rawSchema: { ...refreshed, fields: reconciled },
          updatedFields: reconciled.map((field) => ({
            id: field.id as Id<"formFields">,
            entryId: field.entryId,
            label: field.label,
            type: field.type,
            options: field.options,
            required: field.required ?? false,
            helpText: field.helpText ?? undefined,
            rawType: field.rawType ?? null,
            validation: field.validation ?? undefined,
          })),
        });
      }

      const preparingItems = await ctx.runQuery(api.runs.listItemsByStatus, {
        runId: args.runId,
        status: "preparing",
        limit: run.count,
      });
      const remaining = preparingItems.length;

      if (remaining === 0) {
        await ctx.runMutation(api.runs.finalizePrepared, { runId: args.runId });
        await ctx.runMutation(api.runs.scheduleRunAction, {
          runId: args.runId,
          action: "process",
          delayMs: 0,
        });
        return { ok: true, status: "queued" };
      }

      const batchSize = Math.min(25, Math.max(3, Math.ceil(run.rateLimit * 3)));
      const batchItems = preparingItems.slice(0, batchSize);
      const samples = await generateSamplesWithFallback(reconciled, batchItems.length, args.runId);

      const preparedResult = await ctx.runMutation(api.runs.applyPreparedBatch, {
        runId: args.runId,
        updates: batchItems.map((item, index) => ({
          id: item.id,
          payload: samples[index],
        })),
      });

      await ctx.runMutation(api.runs.scheduleRunAction, {
        runId: args.runId,
        action: "process",
        delayMs: 0,
      });

      if (preparedResult.status === "queued") {
        return { ok: true, status: "queued" };
      }

      await ctx.runMutation(api.runs.scheduleRunAction, {
        runId: args.runId,
        action: "prepare",
        delayMs: 1000,
      });
      return { ok: true, status: "preparing" };
    } catch (error) {
      console.error("run-prepare-failed", {
        runId: args.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : "Failed to prepare run.";
      await ctx.runMutation(api.runs.setRunStatusOnly, {
        runId: args.runId,
        status: "failed",
        error: message,
      });
      return {
        ok: false,
        status: "failed",
        error: message,
      };
    }
  },
});

export const processRun: ReturnType<typeof action> = action({
  args: { runId: v.id("runs") },
  returns: v.object({ ok: v.boolean(), status: v.string(), error: v.optional(v.string()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; status: string; error?: string }> => {
    const run = await ctx.runQuery(api.runs.getRun, { runId: args.runId });
    if (!run) {
      return { ok: false, status: "failed", error: "Run not found." };
    }

    const activeRun = await ctx.runQuery(api.runs.getFormActiveRun, { formId: run.formId });
    if (activeRun?.activeRunId && activeRun.activeRunId !== run.id) {
      const message = "Run superseded by another active run.";
      await ctx.runMutation(api.runs.setRunStatusOnly, {
        runId: args.runId,
        status: "failed",
        error: message,
      });
      return { ok: false, status: "failed", error: message };
    }

    if (run.status === "preparing") {
      const queuedCheck = await ctx.runQuery(api.runs.listItemsByStatus, {
        runId: args.runId,
        status: "queued",
        limit: 1,
      });

      if (!queuedCheck.length) {
        await ctx.runMutation(api.runs.scheduleRunAction, {
          runId: args.runId,
          action: "prepare",
          delayMs: 500,
        });
        return { ok: true, status: "preparing" };
      }

      await ctx.runMutation(api.runs.setRunStatusOnly, {
        runId: args.runId,
        status: "running",
      });
    }

    if (run.status === "completed" || run.status === "failed") {
      return { ok: true, status: run.status };
    }

    const snapshot = await ctx.runQuery(api.runs.getFormSnapshot, { formId: run.formId });
    let fields = snapshot.fields.map(buildFieldSnapshot);

    let meta =
      (snapshot.form.rawSchema as { meta?: Record<string, string | undefined> } | null)?.meta ?? {};
    let viewUrl = meta.viewUrl || buildViewFormUrl(snapshot.form.formId, snapshot.form.formKind);

    if (!meta.actionUrl || !meta.fbzx || !meta.fvv) {
      try {
        const { html, url } = await withTimeout(
          fetchFormHtml(viewUrl),
          15000,
          "Form refresh timed out",
        );
        const refreshed = parseGoogleForm(html, url);
        const normalizedRefreshed = normalizeFields(refreshed.fields);
        const reconciled = reconcileFields(fields, normalizedRefreshed);
        fields = reconciled;
        meta = { ...meta, ...refreshed.meta } as Record<string, string | undefined>;
        viewUrl = meta.viewUrl || url || viewUrl;

        await ctx.runMutation(api.forms.refreshFormMeta, {
          formId: snapshot.form.id,
          title: refreshed.title,
          rawSchema: { ...refreshed, fields: reconciled },
          updatedFields: reconciled.map((field) => ({
            id: field.id as Id<"formFields">,
            entryId: field.entryId,
            label: field.label,
            type: field.type,
            options: field.options,
            required: field.required ?? false,
            helpText: field.helpText ?? undefined,
            rawType: field.rawType ?? null,
            validation: field.validation ?? undefined,
          })),
        });
      } catch (error) {
        console.error("form-meta-refresh-failed", {
          runId: args.runId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const formUrl =
      meta.actionUrl ||
      buildFormResponseUrl(snapshot.form.formId, snapshot.form.formKind);
    const referer = meta.fbzx ? `${viewUrl}?fbzx=${encodeURIComponent(meta.fbzx)}` : viewUrl;

    const batchSize = Math.min(25, Math.max(3, Math.ceil(run.rateLimit * 3)));
    type PendingItem = {
      id: Id<"runItems">;
      index: number;
      status: string;
      payload?: Record<string, string | string[]>;
    };

    const pendingItems = (await ctx.runQuery(api.runs.listItemsByStatus, {
      runId: args.runId,
      status: "queued",
      limit: batchSize,
    })) as PendingItem[];

    if (!pendingItems.length) {
      const recomputed = await ctx.runMutation(api.runs.recomputeRunStatus, {
        runId: args.runId,
      });
      if (recomputed.status === "completed" || recomputed.status === "failed") {
        return { ok: true, status: recomputed.status };
      }
      await ctx.runMutation(api.runs.scheduleRunAction, {
        runId: args.runId,
        action: "process",
        delayMs: 1000,
      });
      return { ok: true, status: recomputed.status };
    }

    await ctx.runMutation(api.runs.markItemsRunning, {
      itemIds: pendingItems.map((item) => item.id),
    });

    const intervalMs = Math.max(1000 / run.rateLimit, 150);
    const startTime = Date.now();

    const requiredEntryIds = getRequiredEntryIds(fields);

    const updates: Array<{
      id: Id<"runItems">;
      status: string;
      response?: Record<string, unknown>;
      error?: string;
      payload?: Record<string, string | string[]>;
    }> = [];

    for (const [index, item] of pendingItems.entries()) {
      const scheduleAt = startTime + index * intervalMs;
      const waitMs = Math.max(0, scheduleAt - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const payload = (item.payload as PreviewSample | null) ?? {};
      const fullPayload = buildSubmissionPayload(payload, meta);
      const params = toFormParams(fullPayload);

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
          body: params.toString(),
        });

        const responseText = await res.text();
        const analysis = analyzeSubmissionResponse(responseText, res.status);
        const missingEntryIds = getMissingEntryIds(fullPayload, requiredEntryIds);
        const emptyRequired = getEmptyRequiredLabels(fields, fullPayload);
        const accepted =
          analysis.accepted && missingEntryIds.length === 0 && emptyRequired.length === 0;

        const errorMessage =
          accepted
            ? undefined
            : res.status === 401
              ? "Unauthorized (form requires sign-in)"
              : analysis.validationMessage ?? "Response not accepted";

        if (!accepted) {
          console.error("form-submit-rejected", {
            runId: args.runId,
            itemId: item.id,
            status: res.status,
            formId: snapshot.form.formId,
            formKind: snapshot.form.formKind,
            validationMessage: analysis.validationMessage,
            missingEntryIds,
            emptyRequired,
            payloadKeys: Object.keys(fullPayload),
            bodyPreview: responseText.slice(0, 200),
          });
        }

        updates.push({
          id: item.id,
          status: accepted ? "completed" : "failed",
          response: {
            status: res.status,
            accepted,
            validationMessage: analysis.validationMessage,
            missingEntryIds,
            emptyRequired,
            bodyPreview: responseText.slice(0, 200),
          },
          error: errorMessage,
          payload: fullPayload,
        });

      } catch (error) {
        console.error("form-submit-error", {
          runId: args.runId,
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
        updates.push({
          id: item.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Request failed",
          payload: fullPayload,
        });
      }
    }

    const result = await ctx.runMutation(api.runs.finalizeRunBatch, {
      runId: args.runId,
      updates,
    });

    const status = result.status;

    if (status === "running") {
      const nextDelayMs = Math.max(500, intervalMs * pendingItems.length);
      await ctx.runMutation(api.runs.scheduleRunAction, {
        runId: args.runId,
        action: "process",
        delayMs: nextDelayMs,
      });
    }

    return { ok: true, status };
  },
});
