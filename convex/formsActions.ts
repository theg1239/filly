"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { fetchFormHtml, normalizeFields, parseGoogleForm } from "../lib/forms";

const responseFieldValidator = v.object({
  id: v.string(),
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

export const parseForm: ReturnType<typeof action> = action({
  args: {
    url: v.string(),
    externalId: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    form: v.optional(
      v.object({
        recordId: v.string(),
        externalId: v.string(),
        formId: v.string(),
        formKind: v.union(v.literal("d"), v.literal("e")),
        title: v.string(),
        fields: v.array(responseFieldValidator),
      }),
    ),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    form?: {
      recordId: string;
      externalId: string;
      formId: string;
      formKind: "d" | "e";
      title: string;
      fields: Array<{
        id: string;
        entryId: string;
        label: string;
        type: string;
        options?: string[];
        required?: boolean;
        validation?: unknown;
        helpText?: string | null;
        prompt?: string;
        strategy?: string;
        fixedValue?: string;
        pattern?: string;
        enabled?: boolean;
        rawType?: number | null;
      }>;
    };
    error?: string;
  }> => {
    if (!args.url || !args.url.startsWith("http")) {
      return { ok: false, error: "Enter a valid Google Form URL." };
    }

    const externalId = args.externalId || globalThis.crypto.randomUUID();

    try {
      const { html, url } = await fetchFormHtml(args.url);
      const parsed = parseGoogleForm(html, url);
      const fields = normalizeFields(parsed.fields);

      await ctx.runMutation(api.forms.upsertForm, {
        externalId,
        url: args.url,
        formId: parsed.formId,
        formKind: parsed.formKind,
        title: parsed.title,
        rawSchema: { ...parsed, fields },
        fields,
      });

      const loaded = await ctx.runQuery(api.forms.getByExternalId, { externalId });
      if (!loaded) {
        return { ok: false, error: "Form could not be loaded after parsing." };
      }

      return {
        ok: true,
        form: {
          recordId: loaded.form.id,
          externalId: loaded.form.externalId,
          formId: loaded.form.formId,
          formKind: loaded.form.formKind,
          title: loaded.form.title,
          fields: loaded.fields,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to parse form.",
      };
    }
  },
});
