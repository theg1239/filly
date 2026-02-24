"use client";

import { createRealtime, RealtimeProvider } from "@upstash/realtime/client";
import type { RealtimeEvents } from "./realtime";

const { useRealtime } = createRealtime<RealtimeEvents>();

export { RealtimeProvider, useRealtime };
