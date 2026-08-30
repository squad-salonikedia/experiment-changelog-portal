import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";

const PREFIX = "fw_";

/**
 * Personal API tokens (supabase/migrations/003_api_tokens.sql).
 *
 * Only the hash is ever stored. The plaintext is returned once at creation and
 * is unrecoverable afterwards, so a leaked database does not hand out working
 * tokens.
 */

let tableProbe: Promise<boolean> | null = null;

export function tokensEnabled(): Promise<boolean> {
  if (!tableProbe) {
    tableProbe = (async () => {
      const { error } = await supabase.from("api_tokens").select("id").limit(1);
      return !error;
    })();
  }
  return tableProbe;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = PREFIX + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 11) };
}

/** Pulls a bearer token out of an Authorization header, if there is one. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];
  return token && token.startsWith(PREFIX) ? token : null;
}

export type TokenOwner = { email: string; tokenId: string };

/**
 * Resolves a plaintext token to the email that owns it. Returns null for
 * unknown, revoked, or malformed tokens — callers must treat null as "no
 * identity" and refuse the request.
 */
export async function resolveToken(token: string): Promise<TokenOwner | null> {
  if (!(await tokensEnabled())) return null;

  const hash = hashToken(token);
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_email, token_hash, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  // The lookup already matched on hash; this is belt-and-braces against a
  // future change that widens the query.
  const a = Buffer.from(hash, "utf8");
  const b = Buffer.from(data.token_hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed timestamp write must not fail the request.
  void supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { email: String(data.user_email).toLowerCase(), tokenId: data.id };
}
