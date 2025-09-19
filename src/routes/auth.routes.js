import { Router } from "express";
import { startGoogleLogin, googleCallback } from "../controllers/auth.controller.js";

const router = Router();

router.get("/google/start", startGoogleLogin);
router.get("/google/callback", googleCallback);

export default router;
