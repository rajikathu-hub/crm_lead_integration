// src/index.js
import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";

const PORT = Number(process.env.PORT || 3000);

createServer(app).listen(PORT, () => {
  console.log(`Auth server running → http://localhost:${PORT}`);
});
