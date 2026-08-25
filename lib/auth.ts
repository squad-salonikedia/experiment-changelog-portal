import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabase } from "./supabase";

const ALLOWED_DOMAIN = "squadstack.ai";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
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
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;

      const { data, error } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", email)
        .single();

      if (error?.code === "PGRST204" || error?.code === "PGRST205" || error?.code === "42P01" || error?.message?.includes("does not exist")) {
        return true;
      }
      if (error?.code === "PGRST116") {
        return "/not-authorized";
      }
      if (!data) return "/not-authorized";

      return true;
    },
    session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  trustHost: true,
});
