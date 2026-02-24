import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { Auth } from "better-auth";
import { getDb } from "./db";
import * as authSchema from "./auth-schema";

let authInstance: Auth | null = null;

export const getAuth = () => {
  if (authInstance) return authInstance;

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for authentication.");
  }

  if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.");
  }

  authInstance = betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    plugins: [nextCookies()],
  });

  return authInstance;
};
