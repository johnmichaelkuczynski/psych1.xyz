import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studentsTable } from "@workspace/db";
import {
  LoginBody as LoginBodyZ,
  LoginResponse as StudentZ,
  GetCurrentStudentResponse as CurrentStudentZ,
} from "@workspace/api-zod";
import {
  attachSession,
  clearSessionCookie,
  setSessionCookie,
} from "../middlewares/session";

const router: IRouter = Router();

router.use(attachSession);

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBodyZ.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  if (!email || !name) {
    res.status(400).json({ error: "Email and name are required" });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.email, email))
    .limit(1);

  let student = existing[0];
  if (!student) {
    const inserted = await db
      .insert(studentsTable)
      .values({ email, name })
      .returning();
    student = inserted[0]!;
  }

  setSessionCookie(res, student.id);
  res.json(StudentZ.parse(student));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  if (req.studentId == null) {
    res.json(CurrentStudentZ.parse({ student: null }));
    return;
  }
  const rows = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, req.studentId))
    .limit(1);
  const student = rows[0] ?? null;
  res.json(CurrentStudentZ.parse({ student }));
});

export default router;
