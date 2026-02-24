import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  components: {
    PageShell: {
      props: z.object({}),
      description: "Page layout wrapper",
      slots: ["default"],
    },
    Hero: {
      props: z.object({
        eyebrow: z.string().optional(),
        title: z.string(),
        lead: z.string().optional(),
      }),
      description: "Hero block",
      slots: ["default"],
    },
    Section: {
      props: z.object({
        title: z.string(),
        description: z.string().optional(),
      }),
      description: "Section wrapper",
      slots: ["default"],
    },
    Stack: {
      props: z.object({ gap: z.string().optional() }),
      description: "Vertical stack",
      slots: ["default"],
    },
    Row: {
      props: z.object({ gap: z.string().optional() }),
      description: "Horizontal row",
      slots: ["default"],
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.number().min(1).max(3).default(2),
      }),
      description: "Heading",
    },
    Text: {
      props: z.object({ text: z.string() }),
      description: "Paragraph text",
    },
    InputField: {
      props: z.object({
        label: z.string().optional(),
        placeholder: z.string().optional(),
        value: z.string().optional(),
        hint: z.string().optional(),
      }),
      description: "Text input",
    },
    NumberField: {
      props: z.object({
        label: z.string().optional(),
        value: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      }),
      description: "Number input",
    },
    SliderField: {
      props: z.object({
        label: z.string().optional(),
        value: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      }),
      description: "Slider input",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["default", "secondary", "outline", "ghost"]).optional(),
        size: z.enum(["default", "sm", "lg"]).optional(),
        loading: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }),
      description: "Action button",
    },
    FormMeta: {
      props: z.object({}),
      description: "Form metadata display",
    },
    FieldList: {
      props: z.object({}),
      description: "Field configuration list",
    },
    PreviewList: {
      props: z.object({}),
      description: "Preview samples list",
    },
    RunStatus: {
      props: z.object({}),
      description: "Run status panel",
    },
    Footer: {
      props: z.object({}),
      description: "Footer",
    },
  },
  actions: {
    parseForm: {
      params: z.object({}),
      description: "Parse Google Form",
    },
    generatePreview: {
      params: z.object({}),
      description: "Generate preview samples",
    },
    startRun: {
      params: z.object({}),
      description: "Start a run",
    },
    processBatch: {
      params: z.object({}),
      description: "Process a run batch",
    },
  },
});
