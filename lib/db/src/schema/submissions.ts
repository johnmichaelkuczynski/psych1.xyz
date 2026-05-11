import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { studentsTable } from "./students";

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  moduleId: text("module_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  aiScore: real("ai_score"),
  aiClass: text("ai_class"),
  aiCheckedAt: timestamp("ai_checked_at", { withTimezone: true }),
  /** "pending" | "completed" | "failed" */
  aiStatus: text("ai_status").notNull().default("pending"),
  /** Compact event log: [{t, k, d?, p?}] */
  keystrokes: jsonb("keystrokes"),
  /** Score samples taken during typing: [{t, score, cls}] */
  scoreHistory: jsonb("score_history"),
  /** Computed at submit time from keystrokes + scoreHistory */
  activityReport: jsonb("activity_report"),
  /** Was the bar in red when the student hit Submit? */
  flaggedOnSubmit: boolean("flagged_on_submit").notNull().default(false),
  /** "pending" | "reviewed" | "flagged" — instructor workflow */
  reviewStatus: text("review_status").notNull().default("pending"),
  // ---- Process forensics (second AI-detection layer) ----
  /** 0–100 weighted score from writing-process features. */
  processScore: integer("process_score"),
  /** "human" | "mixed" | "likelyAI" */
  processClass: text("process_class"),
  /** Raw computed features + __baselineAdjustedScore/__baselineDeviation/__baselineSnapshot/__baselineN */
  processFeatures: jsonb("process_features"),
  /** Human-readable suspicion strings */
  processFlags: jsonb("process_flags"),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit(
  { id: true, createdAt: true },
);

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
