"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { JsonApp } from "@/app/ui/JsonApp";
import type { FormField } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const createLoadingState = (recordId: string) => ({
  form: {
    url: "",
    loaded: true,
    title: "Loading form...",
    externalId: recordId,
    recordId,
    formId: "",
    formKind: "e" as "d" | "e",
    fields: [] as FormField[],
  },
  run: {
    id: "",
    status: "idle" as "idle" | "failed" | "queued" | "preparing" | "running" | "completed",
    submitted: 0,
    failed: 0,
    prepared: 0,
  },
});

const neoCard =
  "rounded-none border-2 border-foreground bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";
const neoCardAccent =
  "rounded-none border-2 border-foreground bg-secondary shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";

const LoadingState = () => {
  const placeholders = Array.from({ length: 2 });
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1440px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-9 w-72 rounded-none" />
              <Skeleton className="h-4 w-52 rounded-none" />
            </div>
            <Skeleton className="h-10 w-32 rounded-none" />
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Skeleton className="h-5 w-40 rounded-none" />
                <Skeleton className="h-4 w-24 rounded-none" />
              </div>
              {placeholders.map((_, index) => (
                <Card key={`field-skeleton-${index}`} className={`${neoCard} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <Skeleton className="h-10 w-10 rounded-none" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-52 rounded-none" />
                        <Skeleton className="h-3 w-36 rounded-none" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-12 rounded-none" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-3 w-20 rounded-none" />
                    <div className="grid gap-2 md:grid-cols-3">
                      <Skeleton className="h-9 w-full rounded-none" />
                      <Skeleton className="h-9 w-full rounded-none" />
                      <Skeleton className="h-9 w-full rounded-none" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="space-y-6 lg:sticky lg:top-28">
              <Card className={`${neoCardAccent} p-6`}>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-none border-2 border-foreground bg-card">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Parsing your form
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fetching questions and options.
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-2 w-full rounded-none" />
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    <span>Connect</span>
                    <span>Parse</span>
                    <span>Save</span>
                  </div>
                </div>
              </Card>

              <Card className={`${neoCard} overflow-hidden`}>
                <div className="border-b-2 border-foreground bg-secondary px-5 py-4">
                  <Skeleton className="h-4 w-32 rounded-none" />
                </div>
                <div className="space-y-4 px-5 py-6">
                  <Skeleton className="h-4 w-40 rounded-none" />
                  <Skeleton className="h-10 w-full rounded-none" />
                  <Skeleton className="h-4 w-32 rounded-none" />
                  <Skeleton className="h-10 w-full rounded-none" />
                  <Skeleton className="h-4 w-36 rounded-none" />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default function FormClient({ formRecordId }: { formRecordId: string }) {
  const [timedOut, setTimedOut] = useState(false);
  const formData = useQuery(
    api.forms.getByExternalId,
    formRecordId ? { externalId: formRecordId } : "skip",
  );

  useEffect(() => {
    if (!formRecordId || formRecordId === "undefined") return;
    if (formData) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [formData, formRecordId]);

  if (!formRecordId || formRecordId === "undefined") {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        Form record id is missing.
      </div>
    );
  }

  if (formData === undefined) {
    return <LoadingState />;
  }

  if (formData === null && !timedOut) {
    return <LoadingState />;
  }

  if (formData === null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        Form not found.
      </div>
    );
  }

  const initialState = {
    form: {
      url: formData.form.url,
      loaded: true,
      title: formData.form.title,
      externalId: formData.form.externalId,
      recordId: formData.form.id,
      formId: formData.form.formId,
      formKind: formData.form.formKind,
      fields: formData.fields,
    },
    run:
      formData.run ??
      createLoadingState(formRecordId).run,
  };

  return (
    <JsonApp
      mode="configure"
      initialState={initialState}
      key={formData.form.id}
    />
  );
}
