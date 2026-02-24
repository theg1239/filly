import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

const handler = () => toNextJsHandler(getAuth());

export const GET = (request: Request) => handler().GET(request);
export const POST = (request: Request) => handler().POST(request);
export const PUT = (request: Request) => handler().PUT(request);
export const PATCH = (request: Request) => handler().PATCH(request);
export const DELETE = (request: Request) => handler().DELETE(request);
