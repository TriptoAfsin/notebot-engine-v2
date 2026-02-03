import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { levels } from "./levels";

export const questionBanks = pgTable("question_banks", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id")
    .notNull()
    .references(() => levels.id, { onDelete: "cascade" }),
  subjectSlug: varchar("subject_slug", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
