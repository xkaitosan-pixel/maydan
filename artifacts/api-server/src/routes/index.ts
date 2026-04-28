import { Router, type IRouter } from "express";
import healthRouter from "./health";
import migrateRouter from "./migrate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(migrateRouter);

export default router;
