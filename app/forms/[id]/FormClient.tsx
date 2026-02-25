"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { JsonApp } from "@/app/ui/JsonApp";
import type { FormField } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    error: null as string | null,
  },
});

const neoCard =
  "rounded-none border-2 border-foreground bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";
const neoCardAccent =
  "rounded-none border-2 border-foreground bg-secondary shadow-[6px_6px_0_0_rgba(0,0,0,0.65)]";

const LoadingState = () => {
  const placeholders = Array.from({ length: 3 });
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1440px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-9 w-80 rounded-none" />
              <Skeleton className="h-4 w-44 rounded-none" />
            </div>
            <Skeleton className="h-10 w-36 rounded-none" />
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Skeleton className="h-5 w-44 rounded-none" />
                <Skeleton className="h-4 w-28 rounded-none" />
              </div>
              {placeholders.map((_, index) => (
                <Card key={`field-skeleton-${index}`} className={`${neoCard} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <Skeleton className="h-10 w-10 rounded-none" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-64 rounded-none" />
                        <Skeleton className="h-3 w-40 rounded-none" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-none" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-3 w-24 rounded-none" />
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
              <Card className={`${neoCard} overflow-hidden`}>
                <div className="border-b-2 border-foreground bg-secondary px-5 py-4">
                  <Skeleton className="h-4 w-32 rounded-none" />
                </div>
                <div className="space-y-6 px-5 py-6">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40 rounded-none" />
                    <Skeleton className="h-10 w-full rounded-none" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-36 rounded-none" />
                    <Skeleton className="h-3 w-full rounded-none" />
                    <Skeleton className="h-3 w-full rounded-none" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36 rounded-none" />
                    <Skeleton className="h-6 w-full rounded-none" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-none" />
                    <Skeleton className="h-10 w-full rounded-none" />
                  </div>
                </div>
                <div className="border-t-2 border-foreground bg-muted px-5 py-3">
                  <Skeleton className="h-3 w-32 rounded-none" />
                </div>
              </Card>

              <Card className={`${neoCardAccent} p-4`}>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32 rounded-none" />
                  <Skeleton className="h-3 w-full rounded-none" />
                </div>
              </Card>

              <Card className={`${neoCard} p-6`}>
                <Skeleton className="h-4 w-40 rounded-none" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full rounded-none" />
                  <Skeleton className="h-3 w-[90%] rounded-none" />
                  <Skeleton className="h-3 w-[85%] rounded-none" />
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
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseStarted, setParseStarted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlParam = searchParams?.get("url") ?? "";
  const parseForm = useAction(api.formsActions.parseForm);
  const formData = useQuery(
    api.forms.getByExternalId,
    formRecordId ? { externalId: formRecordId } : "skip",
  );

  useEffect(() => {
    if (!formRecordId || formRecordId === "undefined") return;
    if (!urlParam || parseStarted) return;
    setParseStarted(true);
    void parseForm({ url: urlParam, externalId: formRecordId }).then((result) => {
      if (!result.ok) {
        setParseError(result.error ?? "Failed to parse form.");
      }
    });
  }, [formRecordId, parseForm, parseStarted, urlParam]);

  useEffect(() => {
    if (!formRecordId || formRecordId === "undefined") return;
    if (formData) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [formData, formRecordId]);

  useEffect(() => {
    if (!formData || !urlParam) return;
    router.replace(`/forms/${formRecordId}`);
  }, [formData, formRecordId, router, urlParam]);

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

  if (parseError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        <p>{parseError}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            className="rounded-none border-2 border-foreground bg-primary text-primary-foreground"
            onClick={() => {
              setParseError(null);
              void parseForm({ url: urlParam, externalId: formRecordId }).then((result) => {
                if (!result.ok) {
                  setParseError(result.error ?? "Failed to parse form.");
                }
              });
            }}
          >
            Try Again
          </Button>
          {urlParam ? (
            <Button
              variant="outline"
              className="rounded-none border-2 border-foreground bg-background text-foreground"
              onClick={() => window.open(urlParam, "_blank")}
            >
              Open Form
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (formData === null && urlParam) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        Still working on this form. If it doesn’t load soon, check that the form is
        public and try again.
      </div>
    );
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
      formData.run
        ? {
            ...formData.run,
            error: formData.run.error ?? null,
          }
        : createLoadingState(formRecordId).run,
  };

  return (
    <JsonApp
      mode="configure"
      initialState={initialState}
      key={formData.form.id}
    />
  );
}
