import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config, AuthPayload, UserRole, normalizeEmail } from "../config.js";

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

function normalizeRoles(roles: unknown): UserRole[] {
  if (Array.isArray(roles)) {
    return roles.filter((r): r is UserRole => r === "operacao" || r === "financeiro");
  }
  if (typeof roles === "string") {
    return roles
      .split(/[,|\s]+/)
      .map((r) => r.trim())
      .filter((r): r is UserRole => r === "operacao" || r === "financeiro");
  }
  return [];
}

function enrichUserRoles(user: AuthPayload): AuthPayload {
  const roles = normalizeRoles(user.roles);
  const isControle = normalizeEmail(user.username) === normalizeEmail(config.finAccount.user);
  if (isControle && !roles.includes("financeiro")) {
    roles.push("financeiro");
  }
  if (isControle && !roles.includes("operacao")) {
    roles.push("operacao");
  }
  return { ...user, roles };
}

export function userHasRole(user: AuthPayload, ...roles: UserRole[]): boolean {
  const normalized = normalizeRoles(user.roles);
  const isControle = normalizeEmail(user.username) === normalizeEmail(config.finAccount.user);
  const effective = isControle
    ? Array.from(new Set<UserRole>([...normalized, "operacao", "financeiro"]))
    : normalized;
  return roles.some((r) => effective.includes(r));
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    req.user = enrichUserRoles(jwt.verify(token, config.jwtSecret) as AuthPayload);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (!userHasRole(req.user, ...roles)) {
      res.status(403).json({
        error: "Acesso negado. Saia e entre novamente pelo login Controle (Financeiro).",
      });
      return;
    }
    next();
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "12h" });
}
