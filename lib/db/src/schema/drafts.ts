import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { studentsTable } from "./students";

export const assignmentDraftsTable = pgTable(
  "assignment_drafts",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    content: text("content").notNull(),
    feedback: text("feedback"),
    feedbackAt: timestamp("feedback_at", { withTimezone: true }),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("draft_student_module").on(t.studentId, t.moduleId)],
);

export type AssignmentDraft = typeof assignmentDraftsTable.$inferSelect;
