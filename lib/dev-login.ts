/**
 * Password login for local/test environments only.
 *
 * This exists so the app can be driven end-to-end without going through Google
 * OAuth. It is gated three ways and every one of them must pass:
 *
 *   1. NODE_ENV must not be "production"      — never runs on a real deploy
 *   2. VERCEL must be unset                   — never runs on Vercel, even in preview
 *   3. ENABLE_DEV_LOGIN must be exactly "true" — opt in, not on by default
 *
 * The password itself lives in .env.local (gitignored) and is never sent to the
 * client. If DEV_LOGIN_PASSWORD is missing or shorter than 8 characters the
 * provider stays off, so an empty env var cannot open the door.
 */
export function devLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL) return false;
  if (process.env.ENABLE_DEV_LOGIN !== "true") return false;
  const password = process.env.DEV_LOGIN_PASSWORD ?? "";
  return password.length >= 8;
}

/** Constant-time-ish compare so the check does not leak length by timing. */
export function devPasswordMatches(candidate: string): boolean {
  const expected = process.env.DEV_LOGIN_PASSWORD ?? "";
  if (!expected || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return diff === 0;
}
