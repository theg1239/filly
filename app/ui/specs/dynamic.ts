export const dynamicSpec = {
  root: "dynamicRoot",
  elements: {
    dynamicRoot: {
      type: "Stack",
      props: { gap: "gap-6" },
      children: ["fieldList", "previewList", "runStatus"],
    },
    fieldList: {
      type: "FieldList",
      props: {},
    },
    previewList: {
      type: "PreviewList",
      props: {},
    },
    runStatus: {
      type: "RunStatus",
      props: {},
    },
  },
} as const;
