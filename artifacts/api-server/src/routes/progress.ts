import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, studentsTable, submissionsTable } from "@workspace/db";
import {
  GetProgressResponse as ProgressZ,
  SaveIntroBody as SaveIntroBodyZ,
} from "@workspace/api-zod";
import { attachSession, requireStudent } from "../middlewares/session";

const router: IRouter = Router();
router.use(attachSession);

async function buildProgress(studentId: number) {
  const subs = await db
    .selectDistinctOn([submissionsTable.moduleId], {
      moduleId: submissionsTable.moduleId,
    })
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId));
  const studentRows = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  return ProgressZ.parse({
    completedModuleIds: subs.map((s) => s.moduleId),
    intro: studentRows[0]?.intro ?? null,
  });
}

router.get(
  "/progress",
  requireStudent,
  async (req: Request, res: Response) => {
    res.json(await buildProgress(req.studentId as number));
  },
);

router.post(
  "/progress/intro",
  requireStudent,
  async (req: Request, res: Response) => {
    const parsed = SaveIntroBodyZ.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const studentId = req.studentId as number;
    await db
      .update(studentsTable)
      .set({ intro: parsed.data.intro })
      .where(eq(studentsTable.id, studentId));
    res.json(await buildProgress(studentId));
  },
);

export { buildProgress };
export default router;
