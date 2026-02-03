import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { levels } from "./levels";

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id")
    .notNull()
    .references(() => levels.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 50 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
