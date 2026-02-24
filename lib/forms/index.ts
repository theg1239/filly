import type { ParsedForm } from "../types";
import { parseFieldsFromItems } from "./fields";
import { extractFormMeta, extractTitleFromHtml } from "./html";
import { findCandidateItems, findPublicLoadData } from "./load-data";

export const parseFormId = (url: string) => {
  const matchE = url.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (matchE) return { formId: matchE[1], formKind: "e" as const };
  const matchD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD) return { formId: matchD[1], formKind: "d" as const };
  return null;
};

export const parseGoogleForm = (html: string, url: string): ParsedForm => {
  const formInfo = parseFormId(url);
  if (!formInfo) {
    throw new Error("Invalid Google Form URL.");
  }

  const data = findPublicLoadData(html);
  if (!data) {
    throw new Error("Could not extract form metadata.");
  }

  const rawTitle =
    (Array.isArray(data?.[1]) && (data?.[1]?.[1]?.[0] || data?.[1]?.[0])) || "";
  const htmlTitle = extractTitleFromHtml(html);
  const title =
    (typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : htmlTitle) ||
    "Untitled Form";

  const items = findCandidateItems(data) ?? [];
  const fields = parseFieldsFromItems(items);

  return {
    formId: formInfo.formId,
    formKind: formInfo.formKind,
    title: typeof title === "string" ? title : "Untitled Form",
    fields,
    meta: extractFormMeta(html, url),
  };
};

export const buildFormResponseUrl = (formId: string, formKind: "d" | "e") => {
  if (formKind === "e") {
    return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
  }
  return `https://docs.google.com/forms/d/${formId}/formResponse`;
};

export const buildViewFormUrl = (formId: string, formKind: "d" | "e") => {
  if (formKind === "e") {
    return `https://docs.google.com/forms/d/e/${formId}/viewform?usp=sf_link`;
  }
  return `https://docs.google.com/forms/d/${formId}/viewform?usp=sf_link`;
};

export { extractFormMeta } from "./html";
