export const findPublicLoadData = (html: string) => {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

export const findCandidateItems = (node: unknown): unknown[] | null => {
  if (!Array.isArray(node)) return null;
  const looksLikeItem = (item: unknown) => {
    if (!Array.isArray(item)) return false;
    return typeof item[1] === "string" && Array.isArray(item[4]);
  };
  if (node.length > 0 && node.some(looksLikeItem)) return node as unknown[];
  for (const item of node) {
    const found = findCandidateItems(item);
    if (found) return found;
  }
  return null;
};
