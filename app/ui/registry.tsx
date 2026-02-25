"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { defineRegistry, useBoundProp, useStateStore, type BaseComponentProps } from "@json-render/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { catalog } from "./catalog";
import { Button as UIButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { FormField, PreviewSample } from "@/lib/types";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  Clock,
  GripVertical,
  List,
  ListChecks,
  ListOrdered,
  Mail,
  Text as TextIcon,
} from "lucide-react";

const neoCard =
  "rounded-none border-2 border-foreground bg-card shadow-[4px_4px_0_0_rgba(0,0,0,0.65)]";
const neoCardAccent =
  "rounded-none border-2 border-foreground bg-secondary shadow-[4px_4px_0_0_rgba(0,0,0,0.65)]";
const neoInput = "rounded-none border-2 border-foreground bg-background";

const PageShell = ({ children }: BaseComponentProps) => {
  const { get } = useStateStore();
  const error = get("/ui/error") as string | null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-14 lg:px-12">
        {error ? (
          <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </Card>
        ) : null}
        {children}
      </div>
    </div>
  );
};

const Hero = ({ props, children }: BaseComponentProps<{ eyebrow?: string; title: string; lead?: string }>) => (
  <div className="grid gap-6">
    <div className="flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-muted-foreground">
      <span className="h-px w-10 bg-border" />
      {props.eyebrow ?? "FormFill"}
    </div>
    <div className="max-w-3xl space-y-4">
      <h1 className="font-serif text-4xl leading-tight text-foreground md:text-5xl">
        {props.title}
      </h1>
      {props.lead && (
        <p className="text-lg text-muted-foreground md:text-xl">{props.lead}</p>
      )}
      {children}
    </div>
  </div>
);

const Section = ({ props, children }: BaseComponentProps<{ title: string; description?: string }>) => (
  <section className="space-y-6">
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold text-foreground">{props.title}</h2>
      {props.description && (
        <p className="text-sm text-muted-foreground">{props.description}</p>
      )}
    </div>
    {children}
  </section>
);

const Stack = ({ props, children }: BaseComponentProps<{ gap?: string }>) => (
  <div className={`flex flex-col ${props.gap ?? "gap-4"}`}>{children}</div>
);

const Row = ({ props, children }: BaseComponentProps<{ gap?: string }>) => (
  <div className={`flex flex-wrap items-center ${props.gap ?? "gap-4"}`}>{children}</div>
);

const Heading = ({ props }: BaseComponentProps<{ text: string; level: number }>) => {
  const Tag = props.level === 1 ? "h1" : props.level === 2 ? "h2" : "h3";
  return <Tag className="text-xl font-semibold text-foreground">{props.text}</Tag>;
};

const Text = ({ props }: BaseComponentProps<{ text: string }>) => (
  <p className="text-sm text-muted-foreground">{props.text}</p>
);

const InputField = ({
  props,
  bindings,
}: BaseComponentProps<{ label?: string; placeholder?: string; value?: string; hint?: string }>) => {
  const [value, setValue] = useBoundProp<string>(props.value, bindings?.value);
  return (
    <div className="space-y-2">
      {props.label && <p className="text-sm font-medium">{props.label}</p>}
      <Input
        value={value ?? ""}
        placeholder={props.placeholder}
        onChange={(event) => setValue(event.target.value)}
        className={neoInput}
      />
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  );
};

const NumberField = ({
  props,
  bindings,
}: BaseComponentProps<{ label?: string; value?: number; min?: number; max?: number; step?: number }>) => {
  const [value, setValue] = useBoundProp<number>(props.value, bindings?.value);
  return (
    <div className="space-y-2">
      {props.label && <p className="text-sm font-medium">{props.label}</p>}
      <Input
        type="number"
        value={value ?? 0}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event) => setValue(Number(event.target.value))}
        className={neoInput}
      />
    </div>
  );
};

const SliderField = ({
  props,
  bindings,
}: BaseComponentProps<{ label?: string; value?: number; min?: number; max?: number; step?: number }>) => {
  const [value, setValue] = useBoundProp<number>(props.value, bindings?.value);
  const current = value ?? props.min ?? 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {props.label && <p className="text-sm font-medium">{props.label}</p>}
        <span className="text-sm text-muted-foreground">{current}</span>
      </div>
      <Slider
        value={[current]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={(vals) => setValue(vals[0] ?? current)}
      />
    </div>
  );
};

const Button = ({
  props,
  emit,
}: BaseComponentProps<{ label: string; variant?: "default" | "secondary" | "outline" | "ghost"; size?: "default" | "sm" | "lg"; loading?: boolean; disabled?: boolean }>) => (
  <UIButton
    variant={props.variant}
    size={props.size}
    disabled={props.disabled || props.loading}
    onClick={() => emit("press")}
  >
    {props.loading ? "Working..." : props.label}
  </UIButton>
);

const FormMeta = () => {
  const { get } = useStateStore();
  const loaded = Boolean(get("/form/loaded"));
  const title = (get("/form/title") as string) ?? "";
  const fields = (get("/form/fields") as FormField[]) ?? [];

  if (!loaded) {
    return (
      <Card className={`${neoCard} p-6 text-sm text-muted-foreground`}>
        Paste a public Google Form link to load its structure.
      </Card>
    );
  }

  return (
    <Card className={`${neoCard} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Detected form</p>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
          {fields.length} fields
        </span>
      </div>
    </Card>
  );
};

const FieldList = () => {
  const { get, set } = useStateStore();
  const fields = (get("/form/fields") as FormField[]) ?? [];
  const [query, setQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);

  if (!fields.length) {
    return (
      <Card className={`${neoCard} p-6 text-sm text-muted-foreground`}>
        No fields detected yet.
      </Card>
    );
  }

  const typeLabel = (field: FormField) => {
    switch (field.type) {
      case "short":
        return "Short Answer";
      case "paragraph":
        return "Paragraph";
      case "multipleChoice":
        return "Multiple Choice";
      case "checkbox":
        return "Checkboxes";
      case "dropdown":
        return "Dropdown";
      case "linearScale":
        return "Linear Scale";
      case "date":
        return "Date";
      case "time":
        return "Time";
      default:
        return "Field";
    }
  };

  const typeIcon = (field: FormField) => {
    switch (field.type) {
      case "short":
        return Mail;
      case "paragraph":
        return TextIcon;
      case "multipleChoice":
        return ListChecks;
      case "checkbox":
        return CheckSquare;
      case "dropdown":
        return List;
      case "linearScale":
        return ListOrdered;
      case "date":
        return CalendarDays;
      case "time":
        return Clock;
      default:
        return AlignLeft;
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFields = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => {
      if (showEnabledOnly && field.enabled === false) return false;
      if (!normalizedQuery) return true;
      return field.label.toLowerCase().includes(normalizedQuery);
    });

  const setAllEnabled = (enabled: boolean) => {
    fields.forEach((_, index) => set(`/form/fields/${index}/enabled`, enabled));
  };

  return (
    <div className="grid gap-4">
      <Card className={`${neoCard} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={query}
            placeholder="Search fields..."
            onChange={(event) => setQuery(event.target.value)}
            className={`${neoInput} w-full sm:flex-1`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <UIButton
              variant="outline"
              className="rounded-none border-2 border-foreground bg-background text-xs"
              onClick={() => setShowEnabledOnly((prev) => !prev)}
            >
              {showEnabledOnly ? "Show All" : "Show Enabled"}
            </UIButton>
            <UIButton
              variant="outline"
              className="rounded-none border-2 border-foreground bg-background text-xs"
              onClick={() => setAllEnabled(true)}
            >
              Enable All
            </UIButton>
            <UIButton
              variant="outline"
              className="rounded-none border-2 border-foreground bg-background text-xs"
              onClick={() => setAllEnabled(false)}
            >
              Disable All
            </UIButton>
            <span className="text-xs text-muted-foreground">
              {filteredFields.length}/{fields.length}
            </span>
          </div>
        </div>
      </Card>
      {filteredFields.map(({ field, index }) => (
        <Card key={field.id} className={`space-y-4 p-4 sm:p-5 ${neoCard}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-none border-2 border-foreground bg-secondary text-primary">
                {(() => {
                  const Icon = typeIcon(field);
                  return <Icon className="h-4 w-4" />;
                })()}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{field.label}</p>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {typeLabel(field)} • {field.required ? "Required" : "Optional"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={field.enabled !== false}
                onCheckedChange={(value) =>
                  set(`/form/fields/${index}/enabled`, Boolean(value))
                }
              />
              <GripVertical className="h-4 w-4" />
            </div>
          </div>

          <div className="rounded-none border-2 border-foreground bg-muted p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Rule
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { value: "random", label: "Randomize" },
                { value: "fixed", label: "Fixed value" },
                { value: "pattern", label: "Pattern" },
              ].map((option) => {
                const active = (field.strategy ?? "random") === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-none border-2 px-3 py-2 text-xs font-medium transition ${
                      active
                        ? "border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_rgba(0,0,0,0.6)]"
                        : "border-foreground bg-background text-muted-foreground"
                    }`}
                    onClick={() =>
                      set(`/form/fields/${index}/strategy`, option.value)
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {(field.strategy ?? "random") === "fixed" ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Fixed value
                </p>
                <Input
                  value={field.fixedValue ?? ""}
                  placeholder="Enter the value to submit every time"
                  onChange={(event) =>
                    set(`/form/fields/${index}/fixedValue`, event.target.value)
                  }
                  className={neoInput}
                />
              </div>
            ) : null}
            {(field.strategy ?? "random") === "pattern" ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Pattern hint
                </p>
                <Input
                  value={field.pattern ?? ""}
                  placeholder="e.g. first.last+{num}@gmail.com"
                  onChange={(event) =>
                    set(`/form/fields/${index}/pattern`, event.target.value)
                  }
                  className={neoInput}
                />
              </div>
            ) : null}
          </div>

          {field.options?.length ? (
            <div className="flex flex-wrap gap-2">
              {field.options.map((option) => (
                <span
                  key={option}
                  className="rounded-none border-2 border-foreground px-2 py-1 text-xs text-muted-foreground"
                >
                  {option}
                </span>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Prompt override
            </p>
            <Input
              value={field.prompt ?? ""}
              placeholder="Optional instruction for this field"
              onChange={(event) =>
                set(`/form/fields/${index}/prompt`, event.target.value)
              }
              className={neoInput}
            />
          </div>
        </Card>
      ))}
    </div>
  );
};

const PreviewList = () => {
  const { get } = useStateStore();
  const samples = (get("/preview/samples") as PreviewSample[]) ?? [];
  const fields = (get("/form/fields") as FormField[]) ?? [];
  const previewLoading = Boolean(get("/ui/loading/preview"));
  const [showAll, setShowAll] = useState(false);
  const visibleFields = showAll ? fields : fields.slice(0, 4);
  const formatValue = (value: PreviewSample[keyof PreviewSample]) => {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return value ?? "-";
  };

  if (previewLoading) {
    return (
      <Card className={`${neoCard} space-y-4 p-6`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36 rounded-none" />
          <Skeleton className="h-4 w-16 rounded-none" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full rounded-none" />
          <Skeleton className="h-3 w-[90%] rounded-none" />
          <Skeleton className="h-3 w-[85%] rounded-none" />
        </div>
      </Card>
    );
  }

  if (!samples.length) {
    return (
      <Card className={`${neoCard} p-6 text-sm text-muted-foreground`}>
        Generate samples to preview AI output.
      </Card>
    );
  }

  return (
    <Card className={`${neoCard} p-4`}>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {visibleFields.length} of {fields.length} fields
        </span>
        {fields.length > 4 ? (
          <UIButton
            variant="outline"
            className="rounded-none border-2 border-foreground bg-background text-[10px]"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll ? "Show Less" : "Show All"}
          </UIButton>
        ) : null}
      </div>
      <div className="space-y-3 sm:hidden">
        {samples.map((sample, index) => (
          <div key={index} className="rounded-none border-2 border-foreground bg-muted/40 p-3">
            {visibleFields.map((field) => (
              <div key={field.id} className="flex items-start justify-between gap-3 border-b border-foreground/20 py-2 text-xs last:border-b-0">
                <span className="font-semibold text-foreground">{field.label}</span>
                <span className="text-muted-foreground">
                  {formatValue(sample[`entry.${field.entryId}`])}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              {visibleFields.map((field) => (
                <TableHead key={field.id}>{field.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {samples.map((sample, index) => (
              <TableRow key={index}>
                {visibleFields.map((field) => (
                  <TableCell key={field.id}>
                    {formatValue(sample[`entry.${field.entryId}`])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

type RunSnapshot = {
  runId: string;
  status: string;
  submitted: number;
  failed: number;
  prepared: number;
  total: number;
  error: string | null;
};

const terminalStatuses = new Set(["completed", "failed"]);
const statusRank: Record<string, number> = {
  idle: 0,
  preparing: 1,
  queued: 2,
  running: 3,
  completed: 4,
  failed: 4,
};

const normalizeCount = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0);

const reduceRunState = (state: RunSnapshot, next: RunSnapshot): RunSnapshot => {
  const normalized: RunSnapshot = {
    ...next,
    submitted: normalizeCount(next.submitted),
    failed: normalizeCount(next.failed),
    prepared: normalizeCount(next.prepared),
    total: Math.max(normalizeCount(next.total), 0),
  };

  if (!state.runId || normalized.runId !== state.runId) {
    return normalized;
  }

  if (terminalStatuses.has(state.status) && !terminalStatuses.has(normalized.status)) {
    return {
      ...state,
      submitted: Math.max(state.submitted, normalized.submitted),
      failed: Math.max(state.failed, normalized.failed),
      prepared: Math.max(state.prepared, normalized.prepared),
      total: Math.max(state.total, normalized.total),
      error: state.error ?? normalized.error,
    };
  }

  const currentRank = statusRank[state.status] ?? 0;
  const nextRank = statusRank[normalized.status] ?? 0;
  const nextStatus = nextRank < currentRank ? state.status : normalized.status;

  const total = Math.max(state.total, normalized.total);

  return {
    ...state,
    ...normalized,
    status: nextStatus,
    submitted: Math.min(total, Math.max(state.submitted, normalized.submitted)),
    failed: Math.min(total, Math.max(state.failed, normalized.failed)),
    prepared: Math.min(total, Math.max(state.prepared, normalized.prepared)),
    total,
    error: normalized.error ?? state.error,
  };
};

const RunStatus = () => {
  const { get } = useStateStore();
  const snapshot: RunSnapshot = {
    status: (get("/run/status") as string) ?? "idle",
    runId: (get("/run/id") as Id<"runs">) ?? "",
    submitted: (get("/run/submitted") as number) ?? 0,
    failed: (get("/run/failed") as number) ?? 0,
    prepared: (get("/run/prepared") as number) ?? 0,
    error: (get("/run/error") as string | null) ?? null,
    total: (get("/settings/submissions") as number) ?? 0,
  };
  const resumeRun = useMutation(api.runs.resumeRun);
  const lastChangeRef = useRef(Date.now());
  const lastResumeRef = useRef(0);
  const [state, dispatch] = useReducer(reduceRunState, snapshot);
  const status = state.status;
  const runId = state.runId;
  const submitted = state.submitted;
  const failed = state.failed;
  const prepared = state.prepared;
  const runError = state.error;
  const total = state.total;
  const progress = total
    ? Math.min(
        ((status === "preparing" ? prepared : submitted) / total) * 100,
        100,
      )
    : 0;
  const isPreparing = status === "preparing";
  const canResume = Boolean(runId) && status === "preparing";
  const canRetry = Boolean(runId) && status === "failed";

  useEffect(() => {
    dispatch(snapshot);
  }, [
    snapshot.runId,
    snapshot.status,
    snapshot.submitted,
    snapshot.failed,
    snapshot.prepared,
    snapshot.total,
    snapshot.error,
  ]);

  useEffect(() => {
    lastChangeRef.current = Date.now();
  }, [status, prepared, submitted, failed]);

  useEffect(() => {
    if (!canResume) return;
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastChangeRef.current;
      const sinceResume = Date.now() - lastResumeRef.current;
      if (idleMs > 15000 && sinceResume > 15000) {
        lastResumeRef.current = Date.now();
        if (runId) {
          void resumeRun({ runId: runId as Id<"runs"> });
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [canResume, resumeRun, runId]);

  return (
    <Card className={`${neoCard} space-y-4 p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-foreground">{status}</p>
        </div>
        <span className="rounded-none border-2 border-foreground bg-muted px-2 py-1 text-xs text-muted-foreground">
          {status === "preparing" ? `${prepared}/${total} prepared` : `${submitted}/${total}`}
          {failed ? ` · ${failed} failed` : ""}
        </span>
      </div>
      <Progress value={progress} indeterminate={isPreparing} />
      <p className="text-xs text-muted-foreground">
        Processing submissions in controlled batches.
      </p>
      {runError ? (
        <div className="rounded-none border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {runError}
        </div>
      ) : null}
      {canResume ? (
        <div className="flex justify-end">
          <UIButton
            variant="outline"
            className="rounded-none border-2 border-foreground bg-background text-xs"
            onClick={() => {
              if (runId) {
                void resumeRun({ runId: runId as Id<"runs"> });
              }
            }}
          >
            Resume
          </UIButton>
        </div>
      ) : null}
      {canRetry ? (
        <div className="flex justify-end">
          <UIButton
            className="rounded-none border-2 border-foreground bg-primary text-xs text-primary-foreground"
            onClick={() => {
              if (runId) {
                void resumeRun({ runId: runId as Id<"runs"> });
              }
            }}
          >
            Retry
          </UIButton>
        </div>
      ) : null}
    </Card>
  );
};

const Footer = () => (
  <div className="border-t border-border pt-6 text-xs text-muted-foreground">
    FormFill Utility · Built for careful, repeatable submissions.
  </div>
);

export const { registry } = defineRegistry(catalog, {
  components: {
    PageShell,
    Hero,
    Section,
    Stack,
    Row,
    Heading,
    Text,
    InputField,
    NumberField,
    SliderField,
    Button,
    FormMeta,
    FieldList,
    PreviewList,
    RunStatus,
    Footer,
  },
  actions: {
    parseForm: async () => {},
    generatePreview: async () => {},
    startRun: async () => {},
    processBatch: async () => {},
  },
});
