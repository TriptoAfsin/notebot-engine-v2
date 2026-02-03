import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { levels } from "./levels";

export const routines = pgTable("routines", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id")
    .notNull()
    .references(() => levels.id, { onDelete: "cascade" }),
  term: varchar("term", { length: 50 }),
  department: varchar("department", { length: 100 }),
  title: varchar("title", { length: 500 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
