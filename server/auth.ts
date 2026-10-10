// Code d'accès mono-utilisateur. Aucun secret en dur : tout vient des variables d'environnement.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE = "__Host-lp"; // préfixe exigé par l'hébergeur pour les cookies
const code = () => process.env.ACCESS_CODE || "";
export const authRequired = () => code().length > 0;
const tokenFor = (c: string) => createHmac("sha256", c).update("lifepilot-session-v1").digest("hex");

const eq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export function isAuthenticated(req: Request) {
  if (!authRequired()) return true;
  const t = (req.headers["x-lp-token"] as string) || readCookie(req, COOKIE);
  return !!t && eq(t, tokenFor(code()));
}

const attempts = new Map<string, { n: number; until: number }>();
export function login(req: Request, res: Response) {
  const ip = req.ip || "?";
  const a = attempts.get(ip);
  if (a && a.n >= 8 && Date.now() < a.until) return res.status(429).json({ message: "Trop d'essais, réessayez dans 15 minutes." });
  const given = String(req.body?.code ?? "");
  if (!authRequired() || eq(given, code())) {
    attempts.delete(ip);
    const token = tokenFor(code());
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}`);
    return res.json({ token });
  }
  attempts.set(ip, { n: (a && Date.now() < a.until ? a.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
  return res.status(401).json({ message: "Code incorrect." });
}

export function logout(_req: Request, res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ message: "Code d'accès requis." });
}

export function requireCron(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return res.status(503).json({ message: "CRON_SECRET non configuré" });
  const h = String(req.headers.authorization || "");
  if (eq(h, `Bearer ${secret}`)) return next();
  res.status(401).json({ message: "Non autorisé" });
}
