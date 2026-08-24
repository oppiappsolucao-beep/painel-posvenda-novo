import { Router, Response } from "express";
import { config, getCanonicalUnitStoreEmail, getUnitByEmail, normalizeEmail, UnitKey } from "../config.js";
import { signToken, authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import {
  assertNotLocked,
  clearLoginFailures,
  listLockedAccounts,
  recordLoginFailure,
  unlockAccount,
} from "../services/loginLockout.js";
import { peekPendingUsername, startTwoFactorChallenge, verifyTwoFactorChallenge } from "../services/twoFactor.js";

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

function isDevUser(username: string, password: string): boolean {
  if (!config.devAccount.enabled) return false;
  const pass = config.devAccount.password;
  if (!pass) return false;
  return (
    normalizeEmail(username) === normalizeEmail(config.devAccount.user) &&
    password === pass
  );
}

function twoFactorRecipientForUnit(unitKey?: UnitKey): string {
  if (unitKey) {
    const unitEmail = getCanonicalUnitStoreEmail(unitKey);
    if (unitEmail) return unitEmail;
  }
  return config.twoFactorEmail;
}

function lockoutResponse(res: Response, failure: { locked: boolean; attemptsLeft: number }) {
  if (failure.locked) {
    res.status(403).json({
      error: "Acesso bloqueado após 3 tentativas incorretas. Solicite o desbloqueio ao financeiro (controle@skoobpet.com.br).",
      locked: true,
    });
    return;
  }

  res.status(401).json({
    error: `Credenciais inválidas. Restam ${failure.attemptsLeft} tentativa(s) antes do bloqueio.`,
    attemptsLeft: failure.attemptsLeft,
  });
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
    if (isDevUser(username, password)) {
      const email = normalizeEmail(username);
      issueSession(res, email, ["operacao", "financeiro"]);
      return;
    }
    if (!isFinanceiroUser(username, password)) {
      res.status(401).json({ error: "Credenciais financeiras inválidas" });
      return;
    }
    const email = normalizeEmail(username);
    issueSession(res, email, ["operacao", "financeiro"]);
    return;
  }

  const email = normalizeEmail(username);

  try {
    assertNotLocked(email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(403).json({ error: msg, locked: true });
    return;
  }

  if (isDevUser(username, password)) {
    clearLoginFailures(email);
    issueSession(res, email, ["operacao", "financeiro"]);
    return;
  }

  if (!isOperacaoUser(username, password)) {
    const failure = recordLoginFailure(email);
    lockoutResponse(res, failure);
    return;
  }

  const unitConfig = getUnitByEmail(email);
  clearLoginFailures(email);

  if (!config.twoFactorEnabled) {
    issueSession(res, email, ["operacao"], unitConfig?.key);
    return;
  }

  try {
    const recipientEmail = twoFactorRecipientForUnit(unitConfig?.key);
    const challengeId = await startTwoFactorChallenge({
      username: email,
      roles: ["operacao"],
      unit: unitConfig?.key,
      unitLabel: unitConfig?.label,
      recipientEmail,
    });

    res.json({
      requires2fa: true,
      challengeId,
      recipientEmail,
      message: `Código enviado para ${recipientEmail}.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: msg.includes("SMTP")
        ? "E-mail de verificação não configurado no servidor. Peça ao administrador para configurar SMTP no EasyPanel."
        : msg,
    });
  }
});

router.post("/verify-2fa", (req, res) => {
  const { challengeId, code } = req.body as { challengeId?: string; code?: string };

  if (!challengeId || !code) {
    res.status(400).json({ error: "Informe o código de verificação." });
    return;
  }

  const pendingEmail = peekPendingUsername(challengeId);
  if (pendingEmail) {
    try {
      assertNotLocked(pendingEmail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(403).json({ error: msg, locked: true });
      return;
    }
  }

  try {
    const session = verifyTwoFactorChallenge(challengeId, code);
    clearLoginFailures(session.username);
    issueSession(res, session.username, session.roles, session.unit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pendingEmail && msg === "Código incorreto.") {
      const failure = recordLoginFailure(pendingEmail);
      if (failure.locked) {
        res.status(403).json({
          error: "Acesso bloqueado após 3 tentativas incorretas. Solicite o desbloqueio ao financeiro (controle@skoobpet.com.br).",
          locked: true,
        });
        return;
      }
      res.status(401).json({
        error: `Código incorreto. Restam ${failure.attemptsLeft} tentativa(s) antes do bloqueio.`,
        attemptsLeft: failure.attemptsLeft,
      });
      return;
    }
    res.status(401).json({ error: msg });
  }
});

router.get("/locked-accounts", authMiddleware, requireRole("financeiro"), (_req, res) => {
  res.json({ items: listLockedAccounts() });
});

router.post("/unlock-account", authMiddleware, requireRole("financeiro"), (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "Informe o e-mail da unidade." });
    return;
  }

  const normalized = normalizeEmail(email);
  const unit = getUnitByEmail(normalized);
  if (!unit) {
    res.status(400).json({ error: "E-mail de unidade inválido." });
    return;
  }

  unlockAccount(normalized);
  res.json({
    ok: true,
    message: `Acesso de ${unit.label} desbloqueado.`,
    email: normalized,
  });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

export default router;
