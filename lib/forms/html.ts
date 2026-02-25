const decodeHtml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");

export const stripTags = (value: string) => value.replace(/<[^>]+>/g, "");

export const normalizeText = (value: string) =>
  stripTags(decodeHtml(value)).replace(/\s+/g, " ").trim();

export const extractTitleFromHtml = (html: string) => {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const ogMatch = html.match(/property="og:title" content="([^"]+)"/i);
  const itempropMatch = html.match(/itemprop="name" content="([^"]+)"/i);
  const raw = titleMatch?.[1] ?? ogMatch?.[1] ?? itempropMatch?.[1] ?? "";
  const cleaned = normalizeText(raw);
  if (!cleaned || cleaned.toLowerCase() === "google forms") return "";
  return cleaned;
};

export const extractHiddenInputs = (html: string) => {
  const inputs: Record<string, string> = {};
  const regex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
  const nameRegex = /name=['"]([^'"]+)['"]/i;
  const valueRegex = /value=['"]([^'"]*)['"]/i;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const input = match[0];
    const nameMatch = input.match(nameRegex);
    if (!nameMatch) continue;
    const valueMatch = input.match(valueRegex);
    inputs[nameMatch[1]] = decodeHtml(valueMatch?.[1] ?? "");
  }
  return inputs;
};

export const extractNamedValue = (html: string, name: string) => {
  const match = html.match(
    new RegExp(`name=['"]${name}['"] value=['"]([^'"]+)['"]`, "i"),
  );
  return match ? decodeHtml(match[1]) : "";
};

export const extractFormActionUrl = (html: string) => {
  const match = html.match(/<form[^>]*action=['"]([^'"]+)['"]/i);
  return match ? decodeHtml(match[1]) : "";
};

export const extractFormMeta = (html: string, url: string) => {
  const hidden = extractHiddenInputs(html);
  const pick = (key: string) => hidden[key] || extractNamedValue(html, key);
  const actionUrl = extractFormActionUrl(html);
  return {
    token: pick("token"),
    tag: pick("tag"),
    partialResponse: pick("partialResponse"),
    fbzx: pick("fbzx"),
    fvv: pick("fvv"),
    pageHistory: pick("pageHistory"),
    submissionTimestamp: pick("submissionTimestamp"),
    dlut: pick("dlut"),
    hud: pick("hud"),
    actionUrl,
    viewUrl: url,
  };
};

export const detectFormAccessIssue = (html: string) => {
  const lower = html.toLowerCase();

  if (
    lower.includes("sign in to continue") ||
    lower.includes("sign in to view") ||
    lower.includes("sign in to access")
  ) {
    return "This form requires sign-in or permission to view.";
  }

  if (
    lower.includes("you need permission") ||
    lower.includes("request access") ||
    lower.includes("requires permission") ||
    lower.includes("only users in the owner's organization")
  ) {
    return "This form is restricted to specific users or an organization.";
  }

  if (
    lower.includes("no longer accepting responses") ||
    lower.includes("form is no longer accepting responses") ||
    lower.includes("this form is closed")
  ) {
    return "This form is closed and no longer accepting responses.";
  }

  return null;
};
