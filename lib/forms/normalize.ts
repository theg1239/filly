import type { FormField } from "../types";

export const normalizeFields = (fields: FormField[]): FormField[] =>
  fields.map((field) => ({
    ...field,
    enabled: field.enabled ?? true,
    strategy: field.strategy ?? "random",
    fixedValue: field.fixedValue ?? "",
    pattern: field.pattern ?? "",
    prompt: field.prompt ?? "",
    helpText: field.helpText ?? null,
    rawType: field.rawType ?? null,
  }));
