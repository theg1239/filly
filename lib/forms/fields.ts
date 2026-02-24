import type { FormField } from "../types";
import { FIELD_TYPE_MAP } from "./constants";
import { normalizeText } from "./html";

const extractValidationMessage = (validation: unknown): string | undefined => {
  if (typeof validation === "string") return validation;
  if (Array.isArray(validation)) {
    for (const item of validation) {
      const message = extractValidationMessage(item);
      if (message) return message;
    }
  }
  return undefined;
};

const extractOptionsFromChoices = (choices: unknown): string[] | undefined => {
  if (!Array.isArray(choices)) return undefined;

  if (choices.length >= 2 && typeof choices[0] === "number" && typeof choices[1] === "number") {
    const min = choices[0];
    const max = choices[1];
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const start = Math.min(min, max);
      const end = Math.max(min, max);
      return Array.from({ length: end - start + 1 }, (_, idx) => String(start + idx));
    }
  }

  if (choices.length > 0 && Array.isArray(choices[0])) {
    const options = choices
      .map((entry) => {
        if (!Array.isArray(entry)) return null;
        const value = entry[0];
        return typeof value === "string" ? normalizeText(value) : null;
      })
      .filter((value): value is string => Boolean(value));
    if (options.length) return options;
  }

  if (choices.every((value) => typeof value === "string")) {
    const options = choices.map((value) => normalizeText(value));
    return options.length ? options : undefined;
  }

  return undefined;
};

const isChoiceEntry = (entry: unknown): entry is [string, ...unknown[]] =>
  Array.isArray(entry) && entry.length > 0 && typeof entry[0] === "string";

const getNested = (node: unknown, path: number[]): unknown => {
  let current: unknown = node;
  for (const index of path) {
    if (!Array.isArray(current)) return undefined;
    current = current[index];
  }
  return current;
};

const collectChoiceLists = (node: unknown, acc: unknown[][]) => {
  if (!Array.isArray(node)) return;
  const looksLikeChoiceList = node.length > 0 && node.every(isChoiceEntry);
  if (looksLikeChoiceList) {
    acc.push(node as unknown[]);
    return;
  }
  for (const child of node) {
    collectChoiceLists(child, acc);
  }
};

const extractOptions = (item: unknown[]): string[] | undefined => {
  const choiceBlock = getNested(item, [4, 0, 1]);
  const options = extractOptionsFromChoices(choiceBlock);
  if (options && options.length) return options;

  const candidates: unknown[][] = [];
  collectChoiceLists(item, candidates);
  const sorted = candidates.sort((a, b) => b.length - a.length);
  for (const candidate of sorted) {
    const mapped = extractOptionsFromChoices(candidate);
    if (mapped && mapped.length) return mapped;
  }
  return undefined;
};

export const parseFieldsFromItems = (items: unknown[]): FormField[] => {
  const mapped: Array<FormField | null> = items.map((item) => {
    if (!Array.isArray(item)) return null;
    const rawLabel = typeof item[1] === "string" ? item[1] : "Untitled";
    const label = normalizeText(rawLabel) || "Untitled";
    const typeCode = typeof item[3] === "number" ? item[3] : null;
    const entryId = getNested(item, [4, 0, 0]);
    const required = Boolean(getNested(item, [4, 0, 2]));
    const validation = getNested(item, [4, 0, 4]) ?? null;
    const validationMessage = extractValidationMessage(validation);
    if (!entryId) return null;
    const options = extractOptions(item);
    const helpText = typeof item[2] === "string" ? normalizeText(item[2]) : null;

    const field: FormField = {
      id: String(item[0] ?? entryId),
      entryId: String(entryId),
      label,
      type: typeCode !== null ? FIELD_TYPE_MAP[typeCode] ?? "unsupported" : "unsupported",
      required,
      helpText,
      prompt: "",
      strategy: "random",
      fixedValue: "",
      pattern: "",
      enabled: true,
      rawType: typeCode,
      ...(options ? { options } : {}),
      ...(validation
        ? {
            validation: {
              raw: validation,
              message: validationMessage,
            },
          }
        : {}),
    };

    return field;
  });

  return mapped.filter((field): field is FormField => field !== null);
};
