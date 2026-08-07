import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const syllabuses = pgTable("syllabuses", {
  id: serial("id").primaryKey(),
  // batch number as shown to students, e.g. "45"
  batch: varchar("batch", { length: 20 }).notNull(),
  // route slug used in /app/syllabus/:batch/:dept — e.g. "ae", "all"
  department: varchar("department", { length: 50 }).notNull(),
  // label shown in the bot/web list — e.g. "AE", "All"
  departmentName: varchar("department_name", { length: 100 }).notNull(),
  // departments are listed in curriculum order, not alphabetically — this drives that order
  departmentSort: integer("department_sort").notNull().default(0),
  // the entry label — e.g. "L 1,1", "Course Outline", "Download"
  topic: varchar("topic", { length: 200 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
