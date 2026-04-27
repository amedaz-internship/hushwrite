import { Hono } from "hono";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";

const auth = new Hono();

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

export default auth;
