import { boolean, jsonb, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Bespoke Messenger flows: the reply blocks for payloads that are not a row in the content tables.
 *
 * Everything addressable — topics, subjects, levels, labs, routines, question banks, syllabuses — is
 * resolved live from those tables by `flow.service.ts`. What remains is editorial: the usage
 * instructions, donation details, the top-level menus, partner cards, the sponsor card that sits
 * atop a subject page.
 *
 * That content used to sit in a committed `bespoke-flows.json`, which meant editing the bot's help
 * text required a deploy — the exact problem the v2 migration exists to remove. It lives here so the
 * CMS can edit it, and so there is one answer to "where does the bot's content come from": the
 * database.
 *
 * `blocks` is a Messenger message array, stored as-is. It is deliberately not normalised into
 * columns: these are arbitrary Send API payloads (text, button templates, generic cards, quick
 * replies), and a schema that modelled every variant would have to change every time Meta adds one.
 */
export const botFlows = pgTable("bot_flows", {
  id: serial("id").primaryKey(),
  /** the postback payload this answers, lowercased — the bot's lookup key */
  payload: varchar("payload", { length: 200 }).notNull().unique(),
  /** human label for the CMS list, e.g. "Usage instructions" */
  label: varchar("label", { length: 200 }),
  /** grouping for the CMS: menu | help | donation | partner | subject | level | lab | other */
  kind: varchar("kind", { length: 40 }).notNull().default("other"),
  /** the Messenger message array sent in order */
  blocks: jsonb("blocks").$type<Record<string, unknown>[]>().notNull(),
  /** disabled flows fall through to the resolver, then to search — useful for retiring a flow */
  enabled: boolean("enabled").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
