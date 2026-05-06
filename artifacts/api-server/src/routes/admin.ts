import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, studentsTable, submissionsTable } from "@workspace/db";
import { attachSession, requireAdmin } from "../middlewares/session";

const router: IRouter = Router();
router.use(attachSession);

router.get(
  "/admin/submissions",
  requireAdmin,
  async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: submissionsTable.id,
        moduleId: submissionsTable.moduleId,
        createdAt: submissionsTable.createdAt,
        aiScore: submissionsTable.aiScore,
        aiClass: submissionsTable.aiClass,
        aiStatus: submissionsTable.aiStatus,
        flaggedOnSubmit: submissionsTable.flaggedOnSubmit,
        reviewStatus: submissionsTable.reviewStatus,
        studentId: submissionsTable.studentId,
        studentName: studentsTable.name,
        studentEmail: studentsTable.email,
      })
      .from(submissionsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, submissionsTable.studentId))
      .orderBy(desc(submissionsTable.createdAt));
    res.json({ submissions: rows });
  },
);

router.get(
  "/admin/submissions/:id",
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }
    const rows = await db
      .select({
        sub: submissionsTable,
        studentName: studentsTable.name,
        studentEmail: studentsTable.email,
      })
      .from(submissionsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, submissionsTable.studentId))
      .where(eq(submissionsTable.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      submission: {
        ...r.sub,
        studentName: r.studentName,
        studentEmail: r.studentEmail,
      },
    });
  },
);

router.post(
  "/admin/submissions/:id/review",
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response) => {
    const id = Number(req.params.id);
    const status = String(
      (req.body as { status?: unknown })?.status ?? "",
    );
    if (!["pending", "reviewed", "flagged"].includes(status)) {
      res.status(400).json({ error: "Bad status" });
      return;
    }
    await db
      .update(submissionsTable)
      .set({ reviewStatus: status })
      .where(eq(submissionsTable.id, id));
    res.status(204).end();
  },
);

router.get(
  "/admin/students",
  requireAdmin,
  async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: studentsTable.id,
        name: studentsTable.name,
        email: studentsTable.email,
        isAdmin: studentsTable.isAdmin,
        accommodated: studentsTable.accommodated,
      })
      .from(studentsTable)
      .orderBy(studentsTable.id);
    res.json({ students: rows });
  },
);

router.post(
  "/admin/students/:id/accommodate",
  requireAdmin,
  async (req: Request<{ id: string }>, res: Response) => {
    const id = Number(req.params.id);
    const accommodated = !!(req.body as { accommodated?: unknown })
      ?.accommodated;
    await db
      .update(studentsTable)
      .set({ accommodated })
      .where(eq(studentsTable.id, id));
    res.status(204).end();
  },
);

export default router;
