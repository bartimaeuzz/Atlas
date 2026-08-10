/**
 * PIN hashing for staff self-service login (2026-08-10). Uses Node's
 * built-in crypto.scrypt rather than pulling in bcrypt/argon2 — this is a
 * short numeric PIN for a shared restaurant terminal, not a full password,
 * and scrypt is already memory-hard and salted, which is what actually
 * matters here (never store a PIN in plaintext, even a short one).
 *
 * Stored format: "<saltHex>:<hashHex>" in employees.pinHash. Pure,
 * DB-free, unit-tested — same philosophy as the calc engine files, even
 * though this isn't money math.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;
  const candidate = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  // timingSafeEqual instead of === — avoids leaking how many leading bytes
  // matched via response-time differences. Probably overkill for a 4-digit
  // restaurant PIN, but costs nothing to do correctly.
  return timingSafeEqual(candidate, expected);
}
