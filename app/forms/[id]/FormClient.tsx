"use client";

import { useEffect, useState } from "react";
import { JsonApp } from "@/app/ui/JsonApp";
import { getFormRecordAction } from "@/app/actions/form-actions";
import type { FormField } from "@/lib/types";

const createLoadingState = (recordId: string) => ({
  form: {
    url: "",
    loaded: true,
    title: "Loading form...",
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

export default function FormClient({ formRecordId }: { formRecordId: string }) {
  type FormState = ReturnType<typeof createLoadingState>;
  const [state, setState] = useState<
    | { status: "loading"; initialState: FormState }
    | { status: "ready"; initialState: FormState }
    | { status: "error"; message: string }
  >({ status: "loading", initialState: createLoadingState(formRecordId) });

  useEffect(() => {
    if (!formRecordId || formRecordId === "undefined") {
      setState({ status: "error", message: "Form record id is missing." });
      return;
    }

    let active = true;
    let retries = 0;

    const load = async () => {
      const result = await getFormRecordAction(formRecordId);
      if (!active) return;

      if (result.ok) {
        setState({
          status: "ready",
          initialState: {
            form: result.form,
            run: result.run ?? createLoadingState(formRecordId).run,
          },
        });
        return;
      }

      if (retries < 5) {
        retries += 1;
        setTimeout(load, 600);
        return;
      }

      setState({ status: "error", message: result.error ?? "Form not found." });
    };

    load();
    return () => {
      active = false;
    };
  }, [formRecordId]);

  if (state.status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {state.message}
      </div>
    );
  }

  return (
    <JsonApp
      mode="configure"
      initialState={state.initialState}
      key={state.status}
    />
  );
}
