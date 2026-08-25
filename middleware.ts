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
    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/",
    "/not-authorized",
    "/dashboard/:path*",
    "/api/dashboard",
    "/api/experiments/:path*",
    "/api/admin/:path*",
    "/api/me",
  ],
};
