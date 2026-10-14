import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Creating the first account requires a one-time code, so the instance cannot be claimed by
// whoever reaches it first. The code is generated at startup and printed to the server log
// (or taken from SETUP_TOKEN for automated setups) and is irrelevant once an account exists.

// No 0/O or 1/I, so the code is easy to copy from a log by hand: 16 characters, 80 bits.
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const minimumConfiguredLength = 12;
let setupToken: string | null = null;

export function generateSetupToken(): string {
  const characters = Array.from(randomBytes(16), (byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((start) => characters.slice(start, start + 4).join('')).join('-');
}

// Case, spaces, and dashes do not matter when the code is typed.
const normalized = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
const digest = (value: string) => createHash('sha256').update(normalized(value)).digest();

/** Sets the code for this process; returns the generated code, or null when SETUP_TOKEN provides it. */
export function initSetupToken(configured: string | undefined = process.env.SETUP_TOKEN): string | null {
  if (configured !== undefined && configured !== '') {
    if (normalized(configured).length < minimumConfiguredLength)
      throw new Error(`SETUP_TOKEN musi mieć co najmniej ${minimumConfiguredLength} znaków (bez spacji i myślników).`);
    setupToken = configured;
    return null;
  }
  setupToken = generateSetupToken();
  return setupToken;
}

export function setupTokenMatches(value: unknown): boolean {
  if (!setupToken || typeof value !== 'string') return false;
  // Comparing fixed-length digests keeps the comparison constant-time regardless of input length.
  return timingSafeEqual(digest(value), digest(setupToken));
}
