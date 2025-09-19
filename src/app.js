import express from "express";
import cors from "cors";
import morgan from "morgan";

import { getDb } from "./db.js";
import authRoutes from "./routes/auth.routes.js";
import googleAdsRoutes from "./routes/googleAds.routes.js";
import metaAdsRoutes from "./routes/metaAds.routes.js";
import linkedinRoutes from "./routes/linkedin.routes.js";
import indiaMartRoutes from "./routes/indiamart.routes.js";

const app = express();

/* ---------- DB ---------- */
const db = getDb();
app.set("db", db);
console.log("Supabase client initialized");

/* ---------- Middleware ---------- */
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

/* ---------- Health checks ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/health/db/whoami", async (_req, res) => {
  try {
    const db = await getDb();
    const { data, error } = await db
      .from("user_profiles") 
      .select("id")
      .limit(1);

    if (error) throw error;

    res.json({
      ok: true,
      message: "Supabase connection works",
      rowsChecked: data.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WhoAmI check (using Supabase auth)
app.get("/health/db/whoami", async (req, res) => {
  try {
    const supabase = app.get("db");

    // If you have an auth token from the client (e.g. user logged in)
    const authHeader = req.headers["authorization"]?.replace("Bearer ", "");
    if (!authHeader) {
      return res.status(400).json({ error: "No token provided" });
    }

    const { data: { user }, error } = base.auth.getUser(authHeader);

    if (error) throw error;

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Root ---------- */
app.get("/", (_req, res) =>
  res.send("Auth ready. Go to /auth/google/start")
);

/* ---------- Routes ---------- */
app.use((req, res, next) => {
  console.log("➡️ Incoming request:", req.method, req.url);
  next();
});

app.use("/auth", authRoutes);
app.use("/ads/google", googleAdsRoutes);
app.use("/api/ads/meta", metaAdsRoutes);
app.use("/", linkedinRoutes);
app.use("/", indiaMartRoutes);



/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
