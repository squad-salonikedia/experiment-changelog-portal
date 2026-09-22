import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { supabase } from "./supabase";
import { devLoginEnabled, devPasswordMatches } from "./dev-login";
import type { Provider } from "next-auth/providers";

/**
 * The company runs on two Google Workspace domains and people are split across
 * both, so either one is a valid way in. Everything domain-related reads this
 * list — adding a third domain is a one-line change here.
 */
export const ALLOWED_DOMAINS = ["squadstack.ai", "squadstack.com"] as const;

export function isAllowedDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return (ALLOWED_DOMAINS as readonly string[]).includes(domain);
}

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: {
      params: {
        // `hd` takes a single domain, so it cannot express "either of ours".
        // `*` narrows the account chooser to Workspace accounts — personal
        // Gmail still never shows up — and the real verdict is the domain and
        // invite-list check in `signIn` below, which is where it always was.
        hd: "*",
        prompt: "select_account",
      },
    },
  }),
];

// Only mounted in local/test environments — see lib/dev-login.ts.
if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Test environment",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (!devLoginEnabled()) return null;
        if (!isAllowedDomain(email)) return null;
        if (!devPasswordMatches(password)) return null;

        // Prefer the invite list's spelling so the test user is indistinguishable
        // from the real one (same name, same role, same ownership matching).
        const { data } = await supabase
          .from("allowed_users")
          .select("name, role")
          .eq("email", email)
          .maybeSingle();

        const fallback = email
          .split("@")[0]
          .split(/[._-]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

        return { id: email, email, name: data?.name || fallback };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      // The dev provider already validated the domain and password.
      if (account?.provider === "dev") return true;

      const email = profile?.email?.toLowerCase() ?? "";
      if (!isAllowedDomain(email)) return false;

      const { data, error } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      // No access list exists yet (fresh database, before the table is created).
      // Let people in rather than locking everyone out of a portal whose gate
      // has not been configured.
      if (
        error?.code === "PGRST204" ||
        error?.code === "PGRST205" ||
        error?.code === "42P01" ||
        error?.message?.includes("does not exist")
      ) {
        return true;
      }

      // Any other error means the database did not answer — it is not a verdict
      // about this person. Turning that into "you are not invited" is what made
      // a paused Supabase project look like every member losing their access.
      // Fail closed, but say the true reason.
      if (error) {
        console.error("Could not read the invite list", error);
        return "/not-authorized?reason=unavailable";
      }

      // The database answered and this email is genuinely not on the list.
      if (!data) return "/not-authorized";

      return true;
    },
    jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
        token.name = user.name ?? token.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  trustHost: true,
});
