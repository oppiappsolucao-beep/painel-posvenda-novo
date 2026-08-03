import { Router } from "express";
import { config } from "../config.js";
import { signToken, authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production" || config.frontendUrl.startsWith("https://");
  return { httpOnly: true, sameSite: "lax" as const, secure, maxAge: 12 * 3600 * 1000 };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isOperacaoUser(username: string, password: string): boolean {
  const normalized = normalizeEmail(username);
  return config.operAccounts.some(
    (account) => normalizeEmail(account.user) === normalized && password === account.password,
  );
}

function isFinanceiroUser(username: string, password: string): boolean {
  return (
    normalizeEmail(username) === normalizeEmail(config.finAccount.user) &&
    password === config.finAccount.password
  );
}

router.post("/login", (req, res) => {
  const { username, password, role } = req.body as {
    username?: string;
    password?: string;
    role?: "operacao" | "financeiro";
  };

  if (!username || !password) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    return;
  }

  if (role === "financeiro") {
    if (!isFinanceiroUser(username, password)) {
      res.status(401).json({ error: "Credenciais financeiras inválidas" });
      return;
    }
    const token = signToken({ username: username.trim(), roles: ["operacao", "financeiro"] });
    res.cookie("token", token, cookieOptions());
    res.json({ username: username.trim(), roles: ["operacao", "financeiro"] });
    return;
  }

  if (!isOperacaoUser(username, password)) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = signToken({ username: username.trim(), roles: ["operacao"] });
  res.cookie("token", token, cookieOptions());
  res.json({ username: username.trim(), roles: ["operacao"] });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

export default router;
