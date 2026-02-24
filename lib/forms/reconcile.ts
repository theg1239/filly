import type { FormField } from "../types";
import { normalizeText } from "./html";

const normalizeLabel = (label: string) => normalizeText(label).toLowerCase();

export const reconcileFields = (stored: FormField[], refreshed: FormField[]) => {
  const buckets = new Map<string, FormField[]>();

  const pushBucket = (key: string, field: FormField) => {
    const list = buckets.get(key) ?? [];
    list.push(field);
    buckets.set(key, list);
  };

  refreshed.forEach((field) => {
    const labelKey = normalizeLabel(field.label);
    pushBucket(`${labelKey}|${field.type}`, field);
    pushBucket(`${labelKey}|*`, field);
  });

  const takeBucket = (key: string) => {
    const list = buckets.get(key);
    if (!list?.length) return null;
    return list.shift() ?? null;
  };

  return stored.map((field, index) => {
    const labelKey = normalizeLabel(field.label);
    const match =
      takeBucket(`${labelKey}|${field.type}`) ||
      takeBucket(`${labelKey}|*`) ||
      refreshed[index] ||
      null;

    if (!match) return field;

    return {
      ...field,
      entryId: match.entryId,
      label: match.label,
      type: match.type,
      options: match.options,
      required: match.required,
      validation: match.validation,
      helpText: match.helpText ?? field.helpText,
      rawType: match.rawType ?? field.rawType,
    };
  });
};
