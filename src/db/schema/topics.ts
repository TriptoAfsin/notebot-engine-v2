import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { subjects } from "./subjects";

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
