import crypto from "crypto";
import { UnitKey, UserRole } from "../config.js";
import { sendTwoFactorCode } from "./email.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface PendingLogin {
  username: string;
  roles: UserRole[];
  unit?: UnitKey;
  unitLabel?: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

const pendingLogins = new Map<string, PendingLogin>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, pending] of pendingLogins) {
    if (pending.expiresAt <= now) pendingLogins.delete(id);
  }
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function startTwoFactorChallenge(params: {
  username: string;
  roles: UserRole[];
  unit?: UnitKey;
  unitLabel?: string;
  recipientEmail: string;
}): Promise<string> {
  cleanupExpired();

  const challengeId = crypto.randomUUID();
  const code = generateCode();

  pendingLogins.set(challengeId, {
    username: params.username,
    roles: params.roles,
    unit: params.unit,
    unitLabel: params.unitLabel,
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });

  await sendTwoFactorCode({
    to: params.recipientEmail,
    code,
    username: params.username,
    unitLabel: params.unitLabel,
  });

  return challengeId;
}

export function verifyTwoFactorChallenge(
  challengeId: string,
  code: string,
): { username: string; roles: UserRole[]; unit?: UnitKey } {
  cleanupExpired();

  const pending = pendingLogins.get(challengeId);
  if (!pending) {
    throw new Error("Código expirado ou inválido. Faça login novamente.");
  }

  if (pending.expiresAt <= Date.now()) {
    pendingLogins.delete(challengeId);
    throw new Error("Código expirado. Faça login novamente.");
  }

  pending.attempts += 1;
  if (pending.attempts > MAX_ATTEMPTS) {
    pendingLogins.delete(challengeId);
    throw new Error("Muitas tentativas. Faça login novamente.");
  }

  const normalized = code.replace(/\D/g, "").trim();
  if (normalized !== pending.code) {
    throw new Error("Código incorreto.");
  }

  pendingLogins.delete(challengeId);
  return {
    username: pending.username,
    roles: pending.roles,
    unit: pending.unit,
  };
}
