import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, studentsTable } from "@workspace/db";
import { attachSession, requireStudent } from "../middlewares/session";

const router: IRouter = Router();
router.use(attachSession);

router.post(
  "/integrity/ack",
  requireStudent,
  async (req: Request, res: Response) => {
    const studentId = req.studentId as number;
    await db
      .update(studentsTable)
      .set({ integrityAckAt: new Date() })
      .where(eq(studentsTable.id, studentId));
    res.status(204).end();
  },
);

/**
 * Bootstrap helper: the very first call to this endpoint by any
 * authenticated student promotes them to admin. After at least one
 * admin exists, subsequent calls require an existing admin session.
 */
router.post(
  "/admin/bootstrap",
  requireStudent,
  async (req: Request, res: Response) => {
    const studentId = req.studentId as number;
    // Single transaction with row-level lock to avoid the TOCTOU race
    // where two concurrent first-callers both succeed in claiming admin.
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.isAdmin, true))
        .limit(1)
        .for("update");
      if (existing.length > 0) {
        const me = await tx
          .select({ isAdmin: studentsTable.isAdmin })
          .from(studentsTable)
          .where(eq(studentsTable.id, studentId))
          .limit(1);
        if (!me[0]?.isAdmin) return { ok: false as const };
      }
      await tx
        .update(studentsTable)
        .set({ isAdmin: true })
        .where(eq(studentsTable.id, studentId));
      return { ok: true as const };
    });
    if (!result.ok) {
      res.status(403).json({
        error:
          "An admin already exists. Ask the existing instructor to grant you access.",
      });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
