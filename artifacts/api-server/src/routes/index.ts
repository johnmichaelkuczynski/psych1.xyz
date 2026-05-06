import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import progressRouter from "./progress";
import submissionsRouter from "./submissions";
import tutorRouter from "./tutor";
import aiActionsRouter from "./ai-actions";
import draftsRouter from "./drafts";
import canvasRouter from "./canvas";
import integrityRouter from "./integrity";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(progressRouter);
router.use(submissionsRouter);
router.use(tutorRouter);
router.use(aiActionsRouter);
router.use(draftsRouter);
router.use(canvasRouter);
router.use(integrityRouter);
router.use(adminRouter);

export default router;
