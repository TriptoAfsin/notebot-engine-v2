import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { topics } from "./topics";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
