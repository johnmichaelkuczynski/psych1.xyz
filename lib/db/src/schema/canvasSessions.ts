import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { studentsTable } from "./students";

export const canvasSessionsTable = pgTable(
  "canvas_sessions",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    content: text("content").notNull().default(""),
    /** Append-only event log of typing events */
    keystrokes: jsonb("keystrokes").notNull().default([]),
    /** Sampled GPTZero scores during typing */
    scoreHistory: jsonb("score_history").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("canvas_student_module").on(t.studentId, t.moduleId)],
);

export type CanvasSession = typeof canvasSessionsTable.$inferSelect;
