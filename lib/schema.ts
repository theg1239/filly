import { boolean, integer, jsonb, pgTable, text, timestamp } from "./drizzle";

export const forms = pgTable("forms", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  formId: text("form_id").notNull(),
  formKind: text("form_kind").notNull(),
  title: text("title"),
  rawSchema: jsonb("raw_schema"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const formFields = pgTable("form_fields", {
  id: text("id").primaryKey(),
  formId: text("form_id")
    .notNull()
    .references(() => forms.id, { onDelete: "cascade" }),
  entryId: text("entry_id").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  options: jsonb("options"),
  required: boolean("required").default(false),
  order: integer("order").default(0).notNull(),
  config: jsonb("config"),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  formId: text("form_id")
    .notNull()
    .references(() => forms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  formId: text("form_id").notNull(),
  status: text("status").notNull(),
  count: integer("count").notNull(),
  rateLimit: integer("rate_limit").default(1).notNull(),
  submitted: integer("submitted").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const runItems = pgTable("run_items", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload"),
  response: jsonb("response"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const userKeys = pgTable("user_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export * from "./auth-schema";
