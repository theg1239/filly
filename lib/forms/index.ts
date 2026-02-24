import type { ParsedForm } from "../types";
import { parseFieldsFromItems } from "./fields";
import { extractFormMeta, extractTitleFromHtml } from "./html";
import { findCandidateItems, findPublicLoadData } from "./load-data";
import { buildFormResponseUrl, buildViewFormUrl, parseFormId } from "./urls";
import { fetchFormHtml } from "./request";
import { normalizeFields } from "./normalize";
import { reconcileFields } from "./reconcile";

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

export { buildFormResponseUrl, buildViewFormUrl, parseFormId } from "./urls";
export { extractFormMeta } from "./html";
export { fetchFormHtml } from "./request";
export { normalizeFields } from "./normalize";
export { reconcileFields } from "./reconcile";
