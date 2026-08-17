/**
 * Account recovery code (2026-08-17) — a restaurant-level "master key"
 * that can reset any employee's PIN from the public /login/recover page,
 * for the exact case that motivated it: "the admin forgot his password"
 * and there's no other Manager/Admin left to reset it for them, and (the
 * scenario that actually matters) the restaurant no longer has any way
 * to reach Oliver/Claude to fix it directly in the database.
 *
 * Format: 4 groups of 4 characters from a 32-symbol alphabet that
 * excludes visually-ambiguous characters (0/O, 1/I/L) — same reasoning
 * as most "write this down" recovery-key UIs (AWS, Bitwarden, etc.):
 * this gets read off a screen and copied onto paper by hand, so every
 * character needs to be unambiguous when handwritten or misread.
 * ~20 bits of entropy per group, 80 bits total — comfortably enough to
 * make offline guessing impractical even before the 5-attempt lockout
 * (lib/actions/recovery.ts) kicks in.
 */

import { randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 32 chars, no 0/O/1/I/L
const GROUP_COUNT = 4;
const GROUP_LENGTH = 4;

export function generateRecoveryCodePlaintext(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Normalizes user input before hashing/verifying — uppercases and
 * strips any dashes/whitespace, so "kxqp-7rt4-m2wl-9f3h", "KXQP 7RT4
 * M2WL 9F3H", and "KXQP-7RT4-M2WL-9F3H" all verify identically. Applied
 * on BOTH generation and verification so the stored hash and a
 * user-typed attempt are always compared on the same normalized form. */
export function normalizeRecoveryCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
