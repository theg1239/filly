"use client";

import type { ReactNode } from "react";
import { RealtimeProvider } from "@/lib/realtime-client";

export const Providers = ({ children }: { children: ReactNode }) => (
  <RealtimeProvider>{children}</RealtimeProvider>
);
