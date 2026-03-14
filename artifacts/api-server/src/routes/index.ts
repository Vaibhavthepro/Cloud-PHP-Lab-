import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import projectsRouter from "./projects.js";
import phpRouter from "./php.js";
import databasesRouter from "./databases.js";
import exportRouter from "./export.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/projects", phpRouter);
router.use("/projects", databasesRouter);
router.use("/projects", exportRouter);

export default router;
