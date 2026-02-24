export type FieldType =
  | "short"
  | "paragraph"
  | "multipleChoice"
  | "checkbox"
  | "dropdown"
  | "linearScale"
  | "date"
  | "time"
  | "unsupported";

export type FieldStrategy = "random" | "fixed" | "pattern";

export type FieldValidation = {
  raw?: unknown;
  message?: string;
};

export type FormField = {
  id: string;
  entryId: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  validation?: FieldValidation;
  helpText?: string | null;
  prompt?: string;
  strategy?: FieldStrategy;
  fixedValue?: string;
  pattern?: string;
  enabled?: boolean;
  rawType?: number | null;
};

export type ParsedForm = {
  formId: string;
  formKind: "d" | "e";
  title: string;
  fields: FormField[];
  meta?: {
    token?: string;
    tag?: string;
    partialResponse?: string;
    fbzx?: string;
    fvv?: string;
    pageHistory?: string;
    submissionTimestamp?: string;
    dlut?: string;
    hud?: string;
    actionUrl?: string;
    viewUrl?: string;
  };
};

export type RunSettings = {
  submissions: number;
  rateLimit: number;
};

export type PreviewSampleValue = string | string[];

export type PreviewSample = Record<string, PreviewSampleValue>;

export type RunItemStatus = "preparing" | "queued" | "running" | "completed" | "failed";

export type RunItem = {
  id: string;
  index: number;
  status: RunItemStatus;
  payload?: PreviewSample | null;
  response?: unknown;
  error?: string | null;
};

export type RunStatus = "idle" | "queued" | "preparing" | "running" | "completed" | "failed";

export type RunRecord = {
  id: string;
  formId: string;
  formKind: "d" | "e";
  status: RunStatus;
  count: number;
  rateLimit: number;
  submitted: number;
  failed: number;
  prepared: number;
  error?: string;
  items: RunItem[];
  createdAt: number;
};
