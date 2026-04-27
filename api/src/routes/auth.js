import { Hono } from "hono";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { authGuard } from "../middleware/auth.js";

const auth = new Hono();

// POST /auth/forgot-password
// Generates a reset token. In production, email this to the user.
// For now, the token is returned in the response (dev convenience).
auth.post("/forgot-password", async (c) => {
  const { email } = await c.req.json();

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  )
    .bind(email.toLowerCase())
    .first();

  // Always return success to avoid email enumeration
  if (!user) {
    return c.json({ message: "If that email exists, a reset link has been sent." });
  }

  // Invalidate any existing unused tokens for this user
  await c.env.DB.prepare(
    "UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0"
  )
    .bind(user.id)
    .run();

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await c.env.DB.prepare(
    "INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), user.id, token, expiresAt)
    .run();

  // In production: send email with the token/link instead of returning it
  return c.json({
    message: "If that email exists, a reset link has been sent.",
    // DEV ONLY — remove in production
    reset_token: token,
  });
});

// POST /auth/reset-password
auth.post("/reset-password", async (c) => {
  const { token, new_password } = await c.req.json();

  if (!token || !new_password) {
    return c.json({ error: "Token and new_password are required" }, 400);
  }

  if (new_password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const reset = await c.env.DB.prepare(
    "SELECT * FROM password_resets WHERE token = ? AND used = 0"
  )
    .bind(token)
    .first();

  if (!reset) {
    return c.json({ error: "Invalid or expired reset token" }, 400);
  }

  if (new Date(reset.expires_at) < new Date()) {
    await c.env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?")
      .bind(reset.id)
      .run();
    return c.json({ error: "Reset token has expired" }, 400);
  }

  // Hash new password and update
  const { hash, salt } = await hashPassword(new_password);

  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(`${hash}:${salt}`, reset.user_id)
    .run();

  // Mark token as used
  await c.env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?")
    .bind(reset.id)
    .run();

  return c.json({ message: "Password has been reset. You can now log in." });
});

// POST /auth/register
auth.post("/register", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  // Check if user already exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  )
    .bind(email.toLowerCase())
    .first();

  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  // Hash password and create user
  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  )
    .bind(id, email.toLowerCase(), `${hash}:${salt}`)
    .run();

  const token = await createToken({ sub: id, email: email.toLowerCase() }, c.env.JWT_SECRET);

  return c.json({ token, userId: id }, 201);
});

// POST /auth/login
auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash FROM users WHERE email = ?"
  )
    .bind(email.toLowerCase())
    .first();

  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const [hash, salt] = user.password_hash.split(":");
  const valid = await verifyPassword(password, hash, salt);

  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await createToken({ sub: user.id, email: user.email }, c.env.JWT_SECRET);

  return c.json({ token, userId: user.id });
});

// POST /auth/change-password (authenticated)
auth.post("/change-password", authGuard(), async (c) => {
  const userId = c.get("userId");
  const { current_password, new_password } = await c.req.json();

  if (!current_password || !new_password) {
    return c.json({ error: "Current password and new password are required" }, 400);
  }

  if (new_password.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const [hash, salt] = user.password_hash.split(":");
  const valid = await verifyPassword(current_password, hash, salt);

  if (!valid) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const { hash: newHash, salt: newSalt } = await hashPassword(new_password);

  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(`${newHash}:${newSalt}`, userId)
    .run();

  return c.json({ message: "Password changed successfully" });
});

export default auth;
