import { buildViewFormUrl, parseFormId } from "./urls";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

export const fetchFormHtml = async (url: string) => {
  let targetUrl = url;
  let response = await fetch(targetUrl, {
    headers: DEFAULT_HEADERS,
    cache: "no-store",
    redirect: "follow",
  });

  if (response.url) {
    targetUrl = response.url;
  }

  if (!response.ok) {
    const parsed = parseFormId(targetUrl) ?? parseFormId(url);
    if (parsed) {
      const fallbackUrl = buildViewFormUrl(parsed.formId, parsed.formKind);
      response = await fetch(fallbackUrl, {
        headers: DEFAULT_HEADERS,
        cache: "no-store",
        redirect: "follow",
      });
      if (response.url) {
        targetUrl = response.url;
      } else {
        targetUrl = fallbackUrl;
      }
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to load the form URL (HTTP ${response.status}).`);
  }

  const html = await response.text();
  return { html, url: targetUrl };
};
