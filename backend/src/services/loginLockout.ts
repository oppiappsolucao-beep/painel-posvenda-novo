import { getUnitByEmail, normalizeEmail, units } from "../config.js";

const MAX_ATTEMPTS = 3;

interface LockRecord {
  attempts: number;
  locked: boolean;
  lockedAt?: number;
  lastAttemptAt?: number;
}

const records = new Map<string, LockRecord>();

function keyFor(email: string): string {
  return normalizeEmail(email);
}

function getRecord(email: string): LockRecord {
  const key = keyFor(email);
  const existing = records.get(key);
  if (existing) return existing;
  const created: LockRecord = { attempts: 0, locked: false };
  records.set(key, created);
  return created;
}

export function isOperacaoAccount(email: string): boolean {
  return !!getUnitByEmail(normalizeEmail(email));
}

export function assertNotLocked(email: string): void {
  const record = getRecord(email);
  if (record.locked) {
    throw new Error(
      "Acesso bloqueado após 3 tentativas incorretas. Solicite o desbloqueio ao financeiro (controle@skoobpet.com.br).",
    );
  }
}

export function recordLoginFailure(email: string): { locked: boolean; attemptsLeft: number } {
  const normalized = normalizeEmail(email);
  if (!isOperacaoAccount(normalized)) {
    return { locked: false, attemptsLeft: MAX_ATTEMPTS };
  }

  const record = getRecord(normalized);
  if (record.locked) {
    return { locked: true, attemptsLeft: 0 };
  }

  record.attempts += 1;
  record.lastAttemptAt = Date.now();

  if (record.attempts >= MAX_ATTEMPTS) {
    record.locked = true;
    record.lockedAt = Date.now();
    return { locked: true, attemptsLeft: 0 };
  }

  return { locked: false, attemptsLeft: MAX_ATTEMPTS - record.attempts };
}

export function clearLoginFailures(email: string): void {
  records.delete(keyFor(email));
}

export function unlockAccount(email: string): boolean {
  const normalized = keyFor(email);
  if (!records.has(normalized)) return false;
  records.delete(normalized);
  return true;
}

export function listLockedAccounts(): Array<{
  email: string;
  unitLabel: string;
  attempts: number;
  lockedAt: string;
}> {
  const locked: Array<{ email: string; unitLabel: string; attempts: number; lockedAt: string }> = [];

  for (const unit of units) {
    const record = records.get(keyFor(unit.user));
    if (!record?.locked) continue;
    locked.push({
      email: unit.user,
      unitLabel: unit.label,
      attempts: record.attempts,
      lockedAt: record.lockedAt
        ? new Date(record.lockedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "—",
    });
  }

  return locked.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel));
}

export function getLockStatus(email: string): { locked: boolean; attempts: number; attemptsLeft: number } {
  const record = getRecord(email);
  return {
    locked: record.locked,
    attempts: record.attempts,
    attemptsLeft: record.locked ? 0 : Math.max(0, MAX_ATTEMPTS - record.attempts),
  };
}
