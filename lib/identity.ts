import { headers } from "next/headers";
import { requireSession } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { bearerFrom, resolveToken } from "@/lib/tokens";

export type Viewer = {
  email: string;
  /** Full name from the invite list, falling back to the Google profile name. */
  name: string;
  /** First name — this is what `experiments.logged_by` displays. */
  firstName: string;
  role: "admin" | "member";
  /** How this request authenticated. Tokens come from AI assistants/scripts. */
  via: "session" | "token";
};

/** The ownership fields a permission check needs off an experiment row. */
export type OwnerRef = {
  owner_email?: string | null;
  logged_by?: string | null;
};

export async function getViewer(): Promise<Viewer | null> {
  // A personal API token identifies the same person a browser session would,
  // so anything logged from an AI assistant is owned by them, not by the tool.
  const token = bearerFrom((await headers()).get("authorization"));
  if (token) {
    const owner = await resolveToken(token);
    if (!owner) return null;

    // Still gated on the invite list, so removing someone kills their tokens
    // straight away without having to revoke each one.
    const { data } = await supabase
      .from("allowed_users")
      .select("name, role")
      .eq("email", owner.email)
      .maybeSingle();
    if (!data) return null;

    const name = (data.name || owner.email.split("@")[0]).trim();
    return {
      email: owner.email,
      name,
      firstName: name.split(/\s+/)[0] ?? "",
      role: data.role === "admin" ? "admin" : "member",
      via: "token",
    };
  }

  const session = await requireSession();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const googleName = session?.user?.name?.trim() ?? "";

  const { data } = await supabase
    .from("allowed_users")
    .select("name, role")
    .eq("email", email)
    .maybeSingle();

  const name = (data?.name || googleName || email.split("@")[0]).trim();

  return {
    email,
    name,
    firstName: name.split(/\s+/)[0] ?? "",
    role: data?.role === "admin" ? "admin" : "member",
    via: "session",
  };
}

/**
 * Ownership is decided by email whenever the row has one. Name matching is
 * only a fallback for rows written before migration 002, and for rows the
 * backfill could not resolve — it is ambiguous when two people share a first
 * name, which is exactly why owner_email exists.
 */
export function ownsExperiment(viewer: Viewer, row: OwnerRef): boolean {
  const ownerEmail = (row.owner_email ?? "").trim().toLowerCase();
  if (ownerEmail) return ownerEmail === viewer.email;

  const loggedBy = (row.logged_by ?? "").trim().toLowerCase();
  if (!loggedBy) return false;
  return (
    loggedBy === viewer.firstName.toLowerCase() ||
    loggedBy === viewer.name.toLowerCase()
  );
}

/**
 * Editing is contributor-only, admins included. An experiment is someone's
 * record of what they ran, so nobody else rewrites it — an admin who needs a
 * correction asks the contributor, or changes it in the database directly.
 *
 * If that ever needs an escape hatch, it is one clause here:
 *   return viewer.role === "admin" || ownsExperiment(viewer, row);
 */
export function canEdit(viewer: Viewer, row: OwnerRef): boolean {
  return ownsExperiment(viewer, row);
}
