import { verifyToken } from "../lib/auth.js";

/**
 * Auth middleware — verifies JWT from Authorization header.
 * Sets c.set("userId", ...) on success, returns 401 on failure.
 */
export function authGuard() {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = header.slice(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (!payload) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    c.set("userId", payload.sub);
    await next();
  };
}
