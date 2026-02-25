import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const activeRunStatuses = new Set(["preparing", "queued", "running"]);

const buildRunSummary = (run: {
  _id: Id<"runs">;
  status: string;
  submitted: number;
  failed: number;
  prepared: number;
}) => ({
  id: run._id,
  status: run.status,
  submitted: run.submitted,
  failed: run.failed,
  prepared: run.prepared,
});

const clearActiveRunIfMatch = async (
  ctx: {
    db: {
      get: (id: Id<"forms">) => Promise<{ activeRunId?: Id<"runs"> } | null>;
      patch: (id: Id<"forms">, value: { activeRunId?: Id<"runs"> }) => Promise<void>;
    };
  },
  formId: Id<"forms">,
  runId: Id<"runs">,
) => {
  const form = await ctx.db.get(formId);
  if (form?.activeRunId === runId) {
    await ctx.db.patch(formId, { activeRunId: undefined });
  }
};

export const getStatus = query({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({
      status: v.string(),
      submitted: v.number(),
      failed: v.number(),
      prepared: v.number(),
      error: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    let submitted = run.submitted;
    let failed = run.failed;
    let prepared = run.prepared;

    if ((run.status === "completed" || run.status === "failed") && submitted + failed < run.count) {
      const items = await ctx.db
        .query("runItems")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      submitted = items.filter((item) => item.status === "completed").length;
      failed = items.filter((item) => item.status === "failed").length;
      prepared = items.filter((item) => item.status !== "preparing").length;
    }

    return {
      status: run.status,
      submitted,
      failed,
      prepared,
      error: run.error ?? undefined,
    };
  },
});

export const getRun = query({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({
      id: v.id("runs"),
      formId: v.id("forms"),
      status: v.string(),
      count: v.number(),
      rateLimit: v.number(),
      submitted: v.number(),
      failed: v.number(),
      prepared: v.number(),
      error: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    return {
      id: run._id,
      formId: run.formId,
      status: run.status,
      count: run.count,
      rateLimit: run.rateLimit,
      submitted: run.submitted,
      failed: run.failed,
      prepared: run.prepared,
      error: run.error ?? undefined,
    };
  },
});

export const getFormSnapshot = query({
  args: { formId: v.id("forms") },
  returns: v.object({
    form: v.object({
      id: v.id("forms"),
      url: v.string(),
      formId: v.string(),
      formKind: v.union(v.literal("d"), v.literal("e")),
      title: v.string(),
      rawSchema: v.optional(v.any()),
    }),
    fields: v.array(
      v.object({
        id: v.id("formFields"),
        entryId: v.string(),
        label: v.string(),
        type: v.string(),
        options: v.optional(v.array(v.string())),
        required: v.optional(v.boolean()),
        helpText: v.optional(v.string()),
        rawType: v.optional(v.union(v.number(), v.null())),
        config: v.optional(v.any()),
        validation: v.optional(v.any()),
        order: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });
    }
    const fields = await ctx.db
      .query("formFields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .order("asc")
      .collect();
    return {
      form: {
        id: form._id,
        url: form.url,
        formId: form.formId,
        formKind: form.formKind,
        title: form.title,
        rawSchema: form.rawSchema ?? undefined,
      },
      fields: fields.map((field) => ({
        id: field._id,
        entryId: field.entryId,
        label: field.label,
        type: field.type,
        options: field.options ?? undefined,
        required: field.required ?? false,
        helpText: field.helpText ?? undefined,
        rawType: field.rawType ?? null,
        config: field.config ?? undefined,
        validation: field.validation ?? undefined,
        order: field.order,
      })),
    };
  },
});

export const getFormActiveRun = query({
  args: { formId: v.id("forms") },
  returns: v.union(
    v.object({
      activeRunId: v.union(v.id("runs"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) return null;
    return { activeRunId: form.activeRunId ?? null };
  },
});

export const listItemsByStatus = query({
  args: {
    runId: v.id("runs"),
    status: v.string(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      id: v.id("runItems"),
      index: v.number(),
      status: v.string(),
      payload: v.optional(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("runItems")
      .withIndex("by_run_status", (q) => q.eq("runId", args.runId).eq("status", args.status))
      .order("asc")
      .take(args.limit);
    return items.map((item) => ({
      id: item._id,
      index: item.index,
      status: item.status,
      payload: item.payload ?? undefined,
    }));
  },
});

export const startRun = mutation({
  args: {
    formId: v.id("forms"),
    fields: v.array(
      v.object({
        id: v.id("formFields"),
        prompt: v.optional(v.string()),
        strategy: v.optional(v.string()),
        fixedValue: v.optional(v.string()),
        pattern: v.optional(v.string()),
        enabled: v.optional(v.boolean()),
        validation: v.optional(v.any()),
      }),
    ),
    settings: v.object({
      submissions: v.number(),
      rateLimit: v.number(),
    }),
  },
  returns: v.object({
    ok: v.boolean(),
    run: v.object({
      id: v.id("runs"),
      status: v.string(),
      submitted: v.number(),
      failed: v.number(),
      prepared: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const count = Math.min(Math.max(args.settings.submissions, 1), 500);
    const rateLimit = Math.max(args.settings.rateLimit, 1);

    const form = await ctx.db.get(args.formId);
    if (!form) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Form not found." });
    }

    if (form.activeRunId) {
      const activeRun = await ctx.db.get(form.activeRunId);
      if (activeRun && activeRunStatuses.has(activeRun.status)) {
        return {
          ok: true,
          run: buildRunSummary(activeRun),
        };
      }
      await ctx.db.patch(form._id, { activeRunId: undefined });
    }

    const fallbackActive = await ctx.db
      .query("runs")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .order("desc")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "preparing"),
          q.eq(q.field("status"), "queued"),
          q.eq(q.field("status"), "running"),
        ),
      )
      .first();

    if (fallbackActive) {
      await ctx.db.patch(form._id, { activeRunId: fallbackActive._id });
      return {
        ok: true,
        run: buildRunSummary(fallbackActive),
      };
    }

    for (const [index, field] of args.fields.entries()) {
      await ctx.db.patch(field.id, {
        order: index,
        config: {
          prompt: field.prompt ?? "",
          strategy: field.strategy ?? "random",
          fixedValue: field.fixedValue ?? "",
          pattern: field.pattern ?? "",
          enabled: field.enabled ?? true,
          validation: field.validation ?? null,
        },
      });
    }

    const runId = await ctx.db.insert("runs", {
      formId: args.formId,
      status: "preparing",
      count,
      rateLimit,
      submitted: 0,
      prepared: 0,
      failed: 0,
      createdAt: Date.now(),
      startedAt: Date.now(),
    });
    await ctx.db.patch(form._id, { activeRunId: runId });

    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("runItems", {
        runId,
        index,
        status: "preparing",
        createdAt: Date.now(),
      });
    }

    await ctx.scheduler.runAfter(0, api.runActions.prepareRun, { runId });

    return {
      ok: true,
      run: {
        id: runId,
        status: "preparing",
        submitted: 0,
        failed: 0,
        prepared: 0,
      },
    };
  },
});

export const applyPreparedSamples = mutation({
  args: {
    runId: v.id("runs"),
    samples: v.array(v.any()),
  },
  returns: v.object({ prepared: v.number() }),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("runItems")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("asc")
      .collect();

    const prepared = Math.min(items.length, args.samples.length);
    for (let index = 0; index < prepared; index += 1) {
      const item = items[index];
      await ctx.db.patch(item._id, {
        payload: args.samples[index],
        status: "queued",
      });
    }

    await ctx.db.patch(args.runId, {
      status: "queued",
      prepared,
    });

    return { prepared };
  },
});

export const setRunStatus = mutation({
  args: {
    runId: v.id("runs"),
    status: v.string(),
    submitted: v.number(),
    failed: v.number(),
    prepared: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      submitted: args.submitted,
      failed: args.failed,
      prepared: args.prepared,
      error: args.status === "failed" ? args.error ?? "Run failed." : undefined,
      finishedAt: args.status === "completed" || args.status === "failed" ? Date.now() : undefined,
    });
    return null;
  },
});

export const setRunStatusOnly = mutation({
  args: {
    runId: v.id("runs"),
    status: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }

    await ctx.db.patch(args.runId, {
      status: args.status,
      error: args.status === "failed" ? args.error ?? "Run failed." : undefined,
      finishedAt: args.status === "completed" || args.status === "failed" ? Date.now() : undefined,
    });
    if (args.status === "completed" || args.status === "failed") {
      await clearActiveRunIfMatch(ctx, run.formId, run._id);
    }
    return null;
  },
});

export const markItemsRunning = mutation({
  args: {
    itemIds: v.array(v.id("runItems")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.itemIds) {
      await ctx.db.patch(id, { status: "running" });
    }
    return null;
  },
});

export const updateRunItems = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("runItems"),
        status: v.string(),
        response: v.optional(v.any()),
        error: v.optional(v.string()),
        payload: v.optional(v.any()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      const completedAt =
        update.status === "completed" || update.status === "failed" ? Date.now() : undefined;
      await ctx.db.patch(update.id, {
        status: update.status,
        response: update.response,
        error: update.error,
        payload: update.payload,
        completedAt,
      });
    }
    return null;
  },
});

export const applyPreparedBatch = mutation({
  args: {
    runId: v.id("runs"),
    updates: v.array(
      v.object({
        id: v.id("runItems"),
        payload: v.optional(v.any()),
      }),
    ),
  },
  returns: v.object({
    prepared: v.number(),
    status: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }

    for (const update of args.updates) {
      await ctx.db.patch(update.id, {
        status: "queued",
        payload: update.payload,
      });
    }

    const nextPrepared = Math.min(run.count, run.prepared + args.updates.length);
    let status = run.status;
    if (status !== "running" && status !== "completed" && status !== "failed") {
      status = nextPrepared >= run.count ? "queued" : "preparing";
    }

    await ctx.db.patch(args.runId, {
      prepared: nextPrepared,
      status,
    });

    return { prepared: nextPrepared, status };
  },
});

export const finalizePrepared = mutation({
  args: {
    runId: v.id("runs"),
  },
  returns: v.object({
    prepared: v.number(),
    status: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }

    const status =
      run.status === "running" || run.status === "completed" || run.status === "failed"
        ? run.status
        : "queued";

    await ctx.db.patch(args.runId, {
      prepared: run.count,
      status,
    });

    return { prepared: run.count, status };
  },
});

export const finalizeRunBatch = mutation({
  args: {
    runId: v.id("runs"),
    updates: v.array(
      v.object({
        id: v.id("runItems"),
        status: v.string(),
        response: v.optional(v.any()),
        error: v.optional(v.string()),
        payload: v.optional(v.any()),
      }),
    ),
  },
  returns: v.object({
    status: v.string(),
    submitted: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }

    let acceptedCount = 0;
    let failedCount = 0;

    for (const update of args.updates) {
      const completedAt =
        update.status === "completed" || update.status === "failed" ? Date.now() : undefined;
      await ctx.db.patch(update.id, {
        status: update.status,
        response: update.response,
        error: update.error,
        payload: update.payload,
        completedAt,
      });

      if (update.status === "completed") {
        acceptedCount += 1;
      } else if (update.status === "failed") {
        failedCount += 1;
      }
    }

    const submitted = run.submitted + acceptedCount;
    const failed = run.failed + failedCount;
    const status =
      submitted + failed >= run.count ? (failed > 0 ? "failed" : "completed") : "running";

    await ctx.db.patch(args.runId, {
      status,
      submitted,
      failed,
      error: status === "failed" ? run.error ?? undefined : undefined,
      finishedAt: status === "completed" || status === "failed" ? Date.now() : undefined,
    });
    if (status === "completed" || status === "failed") {
      await clearActiveRunIfMatch(ctx, run.formId, run._id);
    }

    return { status, submitted, failed };
  },
});

export const recomputeRunStatus = mutation({
  args: {
    runId: v.id("runs"),
  },
  returns: v.object({
    status: v.string(),
    submitted: v.number(),
    failed: v.number(),
    prepared: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }

    const items = await ctx.db
      .query("runItems")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();

    const submitted = items.filter((item) => item.status === "completed").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const prepared = items.filter((item) => item.status !== "preparing").length;

    const hasQueuedOrRunning = items.some(
      (item) => item.status === "queued" || item.status === "running",
    );

    let status = run.status;
    if (submitted + failed >= run.count) {
      status = failed > 0 ? "failed" : "completed";
    } else if (hasQueuedOrRunning) {
      status = "running";
    } else {
      status = "preparing";
    }

    await ctx.db.patch(args.runId, {
      status,
      submitted,
      failed,
      prepared,
      error: status === "failed" ? run.error ?? undefined : undefined,
      finishedAt: status === "completed" || status === "failed" ? Date.now() : undefined,
    });
    if (status === "completed" || status === "failed") {
      await clearActiveRunIfMatch(ctx, run.formId, run._id);
    }

    return { status, submitted, failed, prepared };
  },
});

export const scheduleRunAction = mutation({
  args: {
    runId: v.id("runs"),
    action: v.union(v.literal("prepare"), v.literal("process")),
    delayMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fn =
      args.action === "prepare" ? api.runActions.prepareRun : api.runActions.processRun;
    await ctx.scheduler.runAfter(args.delayMs, fn, { runId: args.runId });
    return null;
  },
});

export const resumeRun = mutation({
  args: {
    runId: v.id("runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, api.runActions.prepareRun, { runId: args.runId });
    await ctx.scheduler.runAfter(0, api.runActions.processRun, { runId: args.runId });
    return null;
  },
});
