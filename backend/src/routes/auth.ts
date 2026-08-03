import { Router, Response } from "express";
import { config, getUnitByEmail, normalizeEmail, UnitKey } from "../config.js";
import { signToken, authMiddleware, AuthRequest } from "../middleware/auth.js";
import { startTwoFactorChallenge, verifyTwoFactorChallenge } from "../services/twoFactor.js";

const router = Router();

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production" || config.frontendUrl.startsWith("https://");
  return { httpOnly: true, sameSite: "lax" as const, secure, maxAge: 12 * 3600 * 1000 };
}

function issueSession(
  res: Response,
  username: string,
  roles: Array<"operacao" | "financeiro">,
  unit?: UnitKey,
) {
  const token = signToken({ username, roles, unit });
  res.cookie("token", token, cookieOptions());
  res.json({ username, roles, unit });
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

router.post("/login", async (req, res) => {
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
    const email = normalizeEmail(username);
    issueSession(res, email, ["operacao", "financeiro"]);
    return;
  }

  if (!isOperacaoUser(username, password)) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  try {
    const email = normalizeEmail(username);
    const unitConfig = getUnitByEmail(email);
    const challengeId = await startTwoFactorChallenge({
      username: email,
      roles: ["operacao"],
      unit: unitConfig?.key,
      unitLabel: unitConfig?.label,
      recipientEmail: config.twoFactorEmail,
    });

    res.json({
      requires2fa: true,
      challengeId,
      message: `Código enviado para ${config.twoFactorEmail}.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/verify-2fa", (req, res) => {
  const { challengeId, code } = req.body as { challengeId?: string; code?: string };

  if (!challengeId || !code) {
    res.status(400).json({ error: "Informe o código de verificação." });
    return;
  }

  try {
    const session = verifyTwoFactorChallenge(challengeId, code);
    issueSession(res, session.username, session.roles, session.unit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(401).json({ error: msg });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

export default router;
