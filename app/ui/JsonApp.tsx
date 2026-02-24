"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  createStateStore,
  useStateStore,
  useStateValue,
} from "@json-render/react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { registry } from "./registry";
import {
  parseFormAction,
  startRunAction,
} from "@/app/actions/form-actions";
import type { FormField, ParsedForm, RunSettings } from "@/lib/types";
import { samplesSchema, type SamplesOutput } from "@/lib/samples-schema";
import { useRealtime } from "@/lib/realtime-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const baseState = {
  ui: {
    loading: {
      parse: false,
      preview: false,
      run: false,
    },
    error: null as string | null,
  },
  form: {
    url: "",
    loaded: false,
    title: "",
    recordId: "",
    formId: "",
    formKind: "e",
    fields: [] as FormField[],
  },
  settings: {
    submissions: 20,
    rateLimit: 3,
    schedule: false,
  },
  preview: {
    samples: [] as Record<string, string | string[]>[],
  },
  run: {
    id: "",
    status: "idle",
    submitted: 0,
    failed: 0,
    prepared: 0,
  },
};

type JsonAppProps = {
  initialState?: Partial<typeof baseState>;
  mode?: "landing" | "configure";
};

const normalizeSpec = (spec: { root: string; elements: Record<string, { type: string; props?: Record<string, unknown> }> }) => {
  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([key, element]) => [
      key,
      { ...element, props: element.props ?? {} },
    ]),
  );
  return { ...spec, elements };
};

const PageContent = ({ mode = "landing" }: Pick<JsonAppProps, "mode">) => {
  const router = useRouter();
  const { get, set } = useStateStore();
  const formLoaded = Boolean(useStateValue("/form/loaded"));
  const error = useStateValue("/ui/error") as string | null;
  const parseLoading = Boolean(useStateValue("/ui/loading/parse"));
  const previewLoading = Boolean(useStateValue("/ui/loading/preview"));
  const runLoading = Boolean(useStateValue("/ui/loading/run"));
  const runId = useStateValue("/run/id") as string | null;
  const runStatus = useStateValue("/run/status") as string | null;
  const runActive = runStatus === "preparing" || runStatus === "running";
  const fields = (get("/form/fields") as FormField[]) ?? [];
  const submissions = (get("/settings/submissions") as number) ?? 20;
  const rateLimit = (get("/settings/rateLimit") as number) ?? 1;
  const etaSeconds = Math.max(Math.ceil(submissions / Math.max(rateLimit, 1)), 1);
  const neoCard =
    "rounded-none border-2 border-foreground bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";
  const neoCardAccent =
    "rounded-none border-2 border-foreground bg-secondary shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";
  const neoButton =
    "rounded-none border-2 border-foreground shadow-[4px_4px_0_0_rgba(0,0,0,0.65)]";
  const neoInput = "rounded-none border-2 border-foreground bg-background";
  const previewLimit = 3;

  const {
    submit: submitPreview,
    object: previewObject,
    isLoading: previewStreaming,
    error: previewError,
    clear: clearPreview,
  } = useObject<typeof samplesSchema, SamplesOutput, { fields: FormField[]; count: number }>({
    api: "/api/samples",
    schema: samplesSchema,
    onError: (err) => {
      set("/ui/error", err.message);
    },
    onFinish: ({ error }) => {
      if (error) {
        set("/ui/error", error.message);
      }
    },
  });

  const fieldSpec = useMemo(
    () =>
      normalizeSpec({
        root: "fieldRoot",
        elements: { fieldRoot: { type: "FieldList", props: {} } },
      }),
    [],
  );
  const previewSpec = useMemo(
    () =>
      normalizeSpec({
        root: "previewRoot",
        elements: { previewRoot: { type: "PreviewList", props: {} } },
      }),
    [],
  );
  const runSpec = useMemo(
    () =>
      normalizeSpec({
        root: "runRoot",
        elements: { runRoot: { type: "RunStatus", props: {} } },
      }),
    [],
  );

  const realtimeEnabled = Boolean(runId) && runStatus !== "completed" && runStatus !== "failed";

  useRealtime({
    enabled: realtimeEnabled,
    channels: runId ? [`run-${runId}`] : [],
    onData: ({ data }) => {
      if (!runId || !data || typeof data !== "object") return;
      const payload = data as {
        runId?: string;
        status?: string;
        submitted?: number;
        failed?: number;
        prepared?: number;
      };
      if (payload.runId !== runId) return;
      if (typeof payload.status === "string") {
        set("/run/status", payload.status);
      }
      if (typeof payload.submitted === "number") {
        set("/run/submitted", payload.submitted);
      }
      if (typeof payload.failed === "number") {
        set("/run/failed", payload.failed);
      }
      if (typeof payload.prepared === "number") {
        set("/run/prepared", payload.prepared);
      }
    },
  });

  useEffect(() => {
    set("/ui/loading/preview", previewStreaming);
  }, [previewStreaming, set]);

  useEffect(() => {
    if (previewError) {
      set("/ui/error", previewError.message);
    }
  }, [previewError, set]);

  useEffect(() => {
    if (!previewObject?.samples || !Array.isArray(previewObject.samples)) return;
    const normalized = previewObject.samples
      .filter((sample) => Boolean(sample && typeof sample === "object"))
      .map((sample) =>
        Object.fromEntries(
          Object.entries(sample as Record<string, unknown>).map(([key, value]) => {
            if (value == null) return [key, ""];
            if (Array.isArray(value)) {
              return [key, value.map((entry) => (entry == null ? "" : String(entry)))];
            }
            return [key, String(value)];
          }),
        ),
      );
    set("/preview/samples", normalized.slice(0, previewLimit));
  }, [previewObject, previewLimit, set]);

  const handleParse = async () => {
    set("/ui/loading/parse", true);
    set("/ui/error", null);

    const url = (get("/form/url") as string) ?? "";
    if (!url || !url.startsWith("http")) {
      set("/ui/error", "Enter a valid Google Form URL.");
      set("/ui/loading/parse", false);
      return;
    }

    if (mode === "landing") {
      const recordId = crypto.randomUUID();
      router.push(`/forms/${recordId}`);
      void parseFormAction(url, recordId);
      return;
    }

    const result = await parseFormAction(url);
    if (!result.ok) {
      set("/ui/error", result.error ?? "Failed to parse form.");
      set("/ui/loading/parse", false);
      return;
    }

    set("/form/loaded", true);
    set("/form/title", result.form.title);
    set(
      "/form/fields",
      result.form.fields.map((field) => ({
        ...field,
        enabled: field.enabled ?? true,
        strategy: field.strategy ?? "random",
        fixedValue: field.fixedValue ?? "",
        pattern: field.pattern ?? "",
      })),
    );
    set("/form/recordId", result.formRecordId);
    set("/form/formId", result.form.formId);
    set("/form/formKind", result.form.formKind);
    set("/ui/loading/parse", false);
  };

  const handlePreview = async () => {
    set("/ui/error", null);
    clearPreview();
    set("/preview/samples", []);
    const fields = (get("/form/fields") as FormField[]) ?? [];
    submitPreview({ fields, count: previewLimit });
  };

  const handleRun = async () => {
    set("/ui/loading/run", true);
    set("/ui/error", null);

    const recordId = (get("/form/recordId") as string) ?? "";
    const form: ParsedForm = {
      formId: (get("/form/formId") as string) ?? "",
      formKind: (get("/form/formKind") as "d" | "e") ?? "e",
      title: (get("/form/title") as string) ?? "",
      fields: (get("/form/fields") as FormField[]) ?? [],
    };
    const fields = (get("/form/fields") as FormField[]) ?? [];
    const settings = (get("/settings") as RunSettings) ?? {
      submissions: 20,
      rateLimit: 3,
    };

    const result = await startRunAction(recordId, form, fields, settings);
    if (!result.ok) {
      set("/ui/error", result.error ?? "Failed to start run.");
      set("/ui/loading/run", false);
      return;
    }

    set("/run/id", result.run.id);
    set("/run/status", "preparing");
    set("/run/submitted", 0);
    set("/run/failed", 0);
    set("/run/prepared", 0);
    set("/ui/loading/run", false);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1440px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-8">
          {error ? (
            <Card className={`${neoCard} border-destructive bg-destructive/20 p-4 text-sm text-destructive`}>
              {error}
            </Card>
          ) : null}

          <div className="relative">
            {mode === "landing" ? (
              <div className="grid min-h-[calc(100vh-160px)] place-items-center">
                <div className="w-full max-w-4xl space-y-10 text-center">
                  <div className="space-y-4">
                    <h1 className="text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl md:whitespace-nowrap">
                      Automate filling your forms
                    </h1>
                    <p className="text-base text-muted-foreground md:whitespace-nowrap">
                      Load a form, define variations, and generate clean submissions for QA, demos, or load checks.
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <Input
                      value={(get("/form/url") as string) ?? ""}
                      placeholder="https://docs.google.com/forms/..."
                      onChange={(event) => set("/form/url", event.target.value)}
                      className={`${neoInput} w-full sm:max-w-[520px]`}
                    />
                    <Button
                      onClick={handleParse}
                      disabled={parseLoading}
                      className={`${neoButton} bg-primary text-primary-foreground`}
                    >
                      {parseLoading ? "Loading..." : "Load Form"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                    {["Parse fields", "Set rules", "Run batches"].map((item) => (
                      <div
                        key={item}
                        className="rounded-none border-2 border-foreground bg-card px-3 py-2"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "configure" ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
                      {(get("/form/title") as string) || "Loaded form"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {fields.length} fields • Status {formLoaded ? "Parsed" : "Waiting"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className={`${neoButton} bg-background text-foreground`}
                      onClick={() => window.location.reload()}
                    >
                      Reset Defaults
                    </Button>
                  </div>
                </div>

                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h3 className="text-lg font-semibold">Detected Fields</h3>
                      <span className="text-xs text-muted-foreground">Customize per field</span>
                    </div>
                    <Renderer spec={fieldSpec} registry={registry} />
                  </div>

                  <div className="space-y-6 lg:sticky lg:top-28">
                    {runActive ? (
                      <Card className={`${neoCard} p-6`}>
                        <h3 className="text-lg font-semibold">Run Status</h3>
                        <div className="pt-4">
                          <Renderer spec={runSpec} registry={registry} />
                        </div>
                      </Card>
                    ) : null}
                    <Card className={`${neoCard} overflow-hidden`}>
                      <div className="border-b-2 border-foreground bg-secondary px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          Run Settings
                        </div>
                      </div>
                      <div className="space-y-6 px-5 py-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                            <span>Total Submissions</span>
                            <span className="rounded-none border-2 border-foreground bg-muted px-2 py-0.5 text-[11px] uppercase tracking-[0.2em]">
                              Max 500
                            </span>
                          </div>
                          <div className="flex items-center overflow-hidden rounded-none border-2 border-foreground bg-muted">
                            <Input
                              type="number"
                              value={submissions}
                              min={1}
                              max={500}
                              onChange={(event) =>
                                set("/settings/submissions", Number(event.target.value))
                              }
                              className="rounded-none border-none bg-transparent focus-visible:ring-0"
                            />
                            <div className="border-l-2 border-foreground bg-muted px-3 py-2 text-xs text-muted-foreground">
                              units
                            </div>
                          </div>
                        </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Speed (Rate Limit)</span>
                          <span className="font-semibold text-primary">
                            ~{rateLimit} subs/sec
                          </span>
                        </div>
                        <Slider
                          value={[rateLimit]}
                          min={1}
                          max={10}
                          step={1}
                          onValueChange={(vals) => set("/settings/rateLimit", vals[0] ?? 1)}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Slow</span>
                          <span>Fast</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-y-2 border-foreground py-4">
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground">Schedule run</p>
                          <p className="text-xs text-muted-foreground">
                            Start immediately or set time
                          </p>
                        </div>
                        <Switch
                          checked={Boolean(get("/settings/schedule"))}
                          onCheckedChange={(value) => set("/settings/schedule", value)}
                          className="rounded-none border-2 border-foreground"
                        />
                      </div>

                      <div className="space-y-3">
                        <Button
                          variant="outline"
                          className={`w-full ${neoButton} bg-background text-foreground`}
                          onClick={handlePreview}
                          disabled={previewLoading}
                        >
                          {previewLoading ? "Generating..." : "Preview Samples"}
                        </Button>
                        <Button
                          className={`w-full ${neoButton} bg-primary text-primary-foreground`}
                          onClick={handleRun}
                          disabled={!formLoaded || runLoading}
                        >
                          {runLoading ? "Starting..." : "Start Generation"}
                        </Button>
                      </div>
                    </div>
                    <div className="border-t-2 border-foreground bg-muted px-5 py-3 text-center text-xs text-muted-foreground">
                      Estimated runtime:{" "}
                      <span className="font-semibold text-foreground">{etaSeconds} seconds</span>
                    </div>
                  </Card>

                  {runActive ? null : (
                    <>
                      <Card className={`${neoCardAccent} p-4 text-sm text-muted-foreground`}>
                        <div className="flex items-start gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Randomization Tip
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Use “Pattern” for email fields to generate realistic variations
                              that bypass simple filters.
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card className={`${neoCard} p-6`}>
                        <h3 className="text-lg font-semibold">Preview Samples</h3>
                        <div className="pt-4">
                          <Renderer spec={previewSpec} registry={registry} />
                        </div>
                      </Card>
                    </>
                  )}
                </div>
              </div>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
};

const mergeState = (overrides?: Partial<typeof baseState>) => ({
  ...baseState,
  ...overrides,
  ui: {
    ...baseState.ui,
    ...overrides?.ui,
    loading: {
      ...baseState.ui.loading,
      ...(overrides?.ui?.loading ?? {}),
    },
  },
  form: {
    ...baseState.form,
    ...overrides?.form,
  },
  settings: {
    ...baseState.settings,
    ...overrides?.settings,
  },
  preview: {
    ...baseState.preview,
    ...overrides?.preview,
  },
  run: {
    ...baseState.run,
    ...overrides?.run,
  },
});

export const JsonApp = ({ initialState, mode = "landing" }: JsonAppProps) => {
  const store = useMemo(() => createStateStore(mergeState(initialState)), [initialState]);

  return (
    <StateProvider store={store}>
      <VisibilityProvider>
        <ActionProvider handlers={{}}>
          <PageContent mode={mode} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
};
