import { Hono } from "hono";
import { cors } from "./middleware/cors.js";
import auth from "./routes/auth.js";
import notes from "./routes/notes.js";
import sync from "./routes/sync.js";

const app = new Hono();

// Global middleware
app.use("*", cors());

// Health check
app.get("/", (c) => {
  return c.json({
    name: "hushwrite-api",
    version: "1.0.0",
    status: "ok",
  });
});

// Routes
app.route("/auth", auth);
app.route("/api/v1/notes", notes);
app.route("/api/v1/sync", sync);

// 404 fallback
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error(`[error] ${err.message}`, err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
