import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { studentsTable } from "./students";

export const tutorConversationsTable = pgTable(
  "tutor_conversations",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tutor_conv_student_module").on(t.studentId, t.moduleId)],
);

export const tutorMessagesTable = pgTable("tutor_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => tutorConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTutorConversationSchema = createInsertSchema(
  tutorConversationsTable,
).omit({ id: true, createdAt: true });
export const insertTutorMessageSchema = createInsertSchema(
  tutorMessagesTable,
).omit({ id: true, createdAt: true });

export type TutorConversation = typeof tutorConversationsTable.$inferSelect;
export type TutorMessage = typeof tutorMessagesTable.$inferSelect;
export type InsertTutorConversation = z.infer<
  typeof insertTutorConversationSchema
>;
export type InsertTutorMessage = z.infer<typeof insertTutorMessageSchema>;
