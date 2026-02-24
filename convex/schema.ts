import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  forms: defineTable({
    externalId: v.string(),
    userId: v.optional(v.string()),
    url: v.string(),
    formId: v.string(),
    formKind: v.union(v.literal("d"), v.literal("e")),
    title: v.string(),
    rawSchema: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_form_id", ["formId"]),
  formFields: defineTable({
    formId: v.id("forms"),
    entryId: v.string(),
    label: v.string(),
    type: v.string(),
    options: v.optional(v.array(v.string())),
    required: v.optional(v.boolean()),
    helpText: v.optional(v.string()),
    rawType: v.optional(v.union(v.number(), v.null())),
    order: v.number(),
    config: v.optional(
      v.object({
        prompt: v.optional(v.string()),
        strategy: v.optional(v.string()),
        fixedValue: v.optional(v.string()),
        pattern: v.optional(v.string()),
        enabled: v.optional(v.boolean()),
        validation: v.optional(v.any()),
      }),
    ),
    validation: v.optional(v.any()),
  })
    .index("by_form", ["formId", "order"])
    .index("by_form_entry", ["formId", "entryId"]),
  runs: defineTable({
    formId: v.id("forms"),
    status: v.string(),
    count: v.number(),
    rateLimit: v.number(),
    submitted: v.number(),
    prepared: v.number(),
    failed: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_form", ["formId", "createdAt"])
    .index("by_status", ["status"]),
  runItems: defineTable({
    runId: v.id("runs"),
    index: v.number(),
    status: v.string(),
    payload: v.optional(v.any()),
    response: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId", "index"])
    .index("by_run_status", ["runId", "status", "index"]),
});
