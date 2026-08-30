import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { supabase } from "./supabase";
import { devLoginEnabled, devPasswordMatches } from "./dev-login";
import type { Provider } from "next-auth/providers";

const ALLOWED_DOMAIN = "squadstack.ai";

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: {
      params: {
        hd: ALLOWED_DOMAIN,
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
        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
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
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;

      const { data, error } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", email)
        .single();

      if (
        error?.code === "PGRST204" ||
        error?.code === "PGRST205" ||
        error?.code === "42P01" ||
        error?.message?.includes("does not exist")
      ) {
        return true;
      }
      if (error?.code === "PGRST116") return "/not-authorized";
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
