import type { FormField, ParsedForm, PreviewSample } from "../types";

export type SubmissionMeta = NonNullable<ParsedForm["meta"]>;

const stripScripts = /<script[\s\S]*?<\/script>/gi;
const stripStyles = /<style[\s\S]*?<\/style>/gi;

const extractAlerts = (html: string) =>
  Array.from(html.matchAll(/role=["']alert["'][^>]*>([^<]{1,200})</gi))
    .map((match) => match[1].trim())
    .filter(Boolean);

export const buildSubmissionPayload = (
  payload: PreviewSample,
  meta: SubmissionMeta,
) => {
  const submissionTimestamp = String(Date.now());
  return {
    ...payload,
    ...(meta.dlut ? { dlut: meta.dlut } : {}),
    ...(meta.hud ? { hud: meta.hud } : {}),
    ...(meta.fvv ? { fvv: meta.fvv } : {}),
    ...(meta.partialResponse ? { partialResponse: meta.partialResponse } : {}),
    ...(meta.pageHistory ? { pageHistory: meta.pageHistory } : {}),
    ...(meta.token ? { token: meta.token } : {}),
    ...(meta.tag ? { tag: meta.tag } : {}),
    ...(meta.fbzx ? { fbzx: meta.fbzx } : {}),
    ...(submissionTimestamp ? { submissionTimestamp } : {}),
  } as Record<string, string | string[]>;
};

export const toFormParams = (payload: Record<string, string | string[]>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      value
        .map((entry) => (entry == null ? "" : String(entry)))
        .filter((entry) => entry.trim().length > 0)
        .forEach((entry) => params.append(key, entry));
    } else if (value != null) {
      params.append(key, String(value));
    }
  }
  return params;
};

export const analyzeSubmissionResponse = (html: string, status: number) => {
  const redirected = status >= 300 && status < 400;
  const visibleText = html.replace(stripScripts, "").replace(stripStyles, "");
  const successText = /your response has been recorded|thanks for submitting|thank you/i.test(
    visibleText,
  );
  const hasFormAction = /<form[^>]*action=["'][^"']*\/formResponse/i.test(html);
  const alertSnippets = extractAlerts(html).slice(0, 3);
  const validationMatch = visibleText.match(
    /(required question|please enter|please select|must be|invalid)/i,
  );
  const validationMessage = alertSnippets[0] ?? (validationMatch ? validationMatch[0] : null);
  const accepted =
    redirected ||
    (status >= 200 && status < 300 && successText) ||
    (status >= 200 && status < 300 && !hasFormAction && !validationMessage);

  return {
    accepted,
    redirected,
    successText,
    hasFormAction,
    validationMessage,
    alertSnippets,
  };
};

export const getRequiredEntryIds = (fields: FormField[]) =>
  fields.filter((field) => field.required).map((field) => field.entryId);

export const getMissingEntryIds = (
  payload: Record<string, string | string[]>,
  entryIds: string[],
) => entryIds.filter((entryId) => !("entry." + entryId in payload));

export const getEmptyRequiredLabels = (fields: FormField[], payload: Record<string, string | string[]>) => {
  const hasValue = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) {
      return value.some((entry) => String(entry ?? "").trim().length > 0);
    }
    return String(value ?? "").trim().length > 0;
  };

  return fields
    .filter((field) => field.required)
    .map((field) => {
      const key = `entry.${field.entryId}`;
      const value = payload[key];
      return hasValue(value) ? null : `${field.label} (${key})`;
    })
    .filter(Boolean);
};
