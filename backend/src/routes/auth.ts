import { Router } from "express";
import { config } from "../config.js";
import { signToken, authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production" || config.frontendUrl.startsWith("https://");
  return { httpOnly: true, sameSite: "lax" as const, secure, maxAge: 12 * 3600 * 1000 };
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
    if (username !== config.finUser || password !== config.finPass) {
      res.status(401).json({ error: "Credenciais financeiras inválidas" });
      return;
    }
    const token = signToken({ username, roles: ["operacao", "financeiro"] });
    res.cookie("token", token, cookieOptions());
    res.json({ username, roles: ["operacao", "financeiro"] });
    return;
  }

  if (username !== config.operUser || password !== config.operPass) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = signToken({ username, roles: ["operacao"] });
  res.cookie("token", token, cookieOptions());
  res.json({ username, roles: ["operacao"] });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

export default router;
