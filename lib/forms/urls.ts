export const parseFormId = (url: string) => {
  const matchE = url.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (matchE) return { formId: matchE[1], formKind: "e" as const };
  const matchD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD) return { formId: matchD[1], formKind: "d" as const };
  return null;
};

export const buildFormResponseUrl = (formId: string, formKind: "d" | "e") => {
  if (formKind === "e") {
    return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
  }
  return `https://docs.google.com/forms/d/${formId}/formResponse`;
};

export const buildViewFormUrl = (formId: string, formKind: "d" | "e") => {
  if (formKind === "e") {
    return `https://docs.google.com/forms/d/e/${formId}/viewform`;
  }
  return `https://docs.google.com/forms/d/${formId}/viewform`;
};
