import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { FormField } from "../lib/types";

const fieldValidator = v.object({
  id: v.optional(v.string()),
  entryId: v.string(),
  label: v.string(),
  type: v.string(),
  options: v.optional(v.array(v.string())),
  required: v.optional(v.boolean()),
  validation: v.optional(v.any()),
  helpText: v.optional(v.union(v.string(), v.null())),
  prompt: v.optional(v.string()),
  strategy: v.optional(v.string()),
  fixedValue: v.optional(v.string()),
  pattern: v.optional(v.string()),
  enabled: v.optional(v.boolean()),
  rawType: v.optional(v.union(v.number(), v.null())),
});

export const getByExternalId = query({
  args: { externalId: v.string() },
  returns: v.union(
    v.object({
      form: v.object({
        id: v.id("forms"),
        externalId: v.string(),
        url: v.string(),
        formId: v.string(),
        formKind: v.union(v.literal("d"), v.literal("e")),
        title: v.string(),
      }),
      fields: v.array(fieldValidator),
      run: v.union(
        v.object({
          id: v.id("runs"),
          status: v.string(),
          submitted: v.number(),
          failed: v.number(),
          prepared: v.number(),
          error: v.optional(v.string()),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!args.externalId) return null;
    const form = await ctx.db
      .query("forms")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!form) return null;

    const fieldRecords = await ctx.db
      .query("formFields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .order("asc")
      .collect();

    const fields: FormField[] = fieldRecords.map((record) => ({
      id: record._id,
      entryId: record.entryId,
      label: record.label,
      type: record.type as FormField["type"],
      options: record.options ?? undefined,
      required: record.required ?? false,
      prompt: record.config?.prompt ?? "",
      strategy: (record.config?.strategy as FormField["strategy"]) ?? "random",
      fixedValue: record.config?.fixedValue ?? "",
      pattern: record.config?.pattern ?? "",
      enabled: record.config?.enabled ?? true,
      validation: (record.validation as FormField["validation"]) ?? record.config?.validation ?? undefined,
      helpText: record.helpText ?? null,
      rawType: record.rawType ?? null,
    }));

    const latestRun = await ctx.db
      .query("runs")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .order("desc")
      .first();

    const run = latestRun
      ? {
          id: latestRun._id,
          status: latestRun.status,
          submitted: latestRun.submitted,
          failed: latestRun.failed,
          prepared: latestRun.prepared,
          error: latestRun.error ?? undefined,
        }
      : null;

    return {
      form: {
        id: form._id,
        externalId: form.externalId,
        url: form.url,
        formId: form.formId,
        formKind: form.formKind,
        title: form.title,
      },
      fields,
      run,
    };
  },
});

export const upsertForm = mutation({
  args: {
    externalId: v.string(),
    url: v.string(),
    formId: v.string(),
    formKind: v.union(v.literal("d"), v.literal("e")),
    title: v.string(),
    rawSchema: v.optional(v.any()),
    fields: v.array(fieldValidator),
  },
  returns: v.object({
    formId: v.id("forms"),
  }),
  handler: async (ctx, args) => {
    if (!args.externalId) {
      throw new ConvexError({ code: "INVALID", message: "externalId is required." });
    }

    const existing = await ctx.db
      .query("forms")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();

    const formId = existing
      ? existing._id
      : await ctx.db.insert("forms", {
          externalId: args.externalId,
          url: args.url,
          formId: args.formId,
          formKind: args.formKind,
          title: args.title,
          rawSchema: args.rawSchema ?? null,
          createdAt: Date.now(),
        });

    if (existing) {
      await ctx.db.patch(formId, {
        url: args.url,
        formId: args.formId,
        formKind: args.formKind,
        title: args.title,
        rawSchema: args.rawSchema ?? null,
      });
    }

    const existingFields = await ctx.db
      .query("formFields")
      .withIndex("by_form", (q) => q.eq("formId", formId))
      .collect();

    for (const field of existingFields) {
      await ctx.db.delete(field._id);
    }

    for (const [index, field] of args.fields.entries()) {
      await ctx.db.insert("formFields", {
        formId,
        entryId: field.entryId,
        label: field.label,
        type: field.type,
        options: field.options ?? undefined,
        required: field.required ?? false,
        helpText: field.helpText ?? undefined,
        rawType: field.rawType ?? null,
        order: index,
        config: {
          prompt: field.prompt ?? "",
          strategy: field.strategy ?? "random",
          fixedValue: field.fixedValue ?? "",
          pattern: field.pattern ?? "",
          enabled: field.enabled ?? true,
          validation: field.validation ?? null,
        },
        validation: field.validation ?? undefined,
      });
    }

    return { formId };
  },
});

export const updateFields = mutation({
  args: {
    formId: v.id("forms"),
    fields: v.array(
      v.object({
        id: v.id("formFields"),
        order: v.number(),
        config: v.object({
          prompt: v.string(),
          strategy: v.string(),
          fixedValue: v.string(),
          pattern: v.string(),
          enabled: v.boolean(),
          validation: v.optional(v.any()),
        }),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const field of args.fields) {
      await ctx.db.patch(field.id, {
        order: field.order,
        config: field.config,
      });
    }
    return null;
  },
});

export const refreshFormMeta = mutation({
  args: {
    formId: v.id("forms"),
    title: v.string(),
    rawSchema: v.optional(v.any()),
    updatedFields: v.array(
      v.object({
        id: v.id("formFields"),
        entryId: v.string(),
        label: v.string(),
        type: v.string(),
        options: v.optional(v.array(v.string())),
        required: v.optional(v.boolean()),
        helpText: v.optional(v.string()),
        rawType: v.optional(v.union(v.number(), v.null())),
        validation: v.optional(v.any()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const field of args.updatedFields) {
      await ctx.db.patch(field.id, {
        entryId: field.entryId,
        label: field.label,
        type: field.type,
        options: field.options ?? undefined,
        required: field.required ?? false,
        helpText: field.helpText ?? undefined,
        rawType: field.rawType ?? null,
        validation: field.validation ?? undefined,
      });
    }

    await ctx.db.patch(args.formId, {
      title: args.title,
      rawSchema: args.rawSchema ?? null,
    });

    return null;
  },
});
