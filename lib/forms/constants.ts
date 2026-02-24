import type { FormField } from "../types";

export const FIELD_TYPE_MAP: Record<number, FormField["type"]> = {
  0: "short",
  1: "paragraph",
  2: "multipleChoice",
  3: "dropdown",
  4: "checkbox",
  5: "linearScale",
  9: "date",
  10: "time",
};
