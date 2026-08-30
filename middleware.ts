import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/not-authorized"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (
    PUBLIC_PATHS.some((path) => pathname === path) ||
    pathname.startsWith("/api/auth")
  ) {
    if (isLoggedIn && pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    // A bearer token carries its own identity. Redirecting an API client to an
    // HTML login page would hand it a 200 full of markup instead of an honest
    // 401, so let the route authenticate it and answer for itself.
    const bearer = req.headers.get("authorization");
    if (bearer?.toLowerCase().startsWith("bearer ") && pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    const loginUrl = new URL("/", req.url);
    const callbackPath = req.nextUrl.search ? pathname + req.nextUrl.search : pathname;
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/",
    "/not-authorized",
    "/dashboard/:path*",
    "/signout",
    "/api/dashboard",
    "/api/experiments/:path*",
    "/api/admin/:path*",
    "/api/me",
    "/api/options",
    "/api/tokens",
    "/api/skill",
  ],
};
