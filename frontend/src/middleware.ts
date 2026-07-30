// Next.js Edge Middleware — first line of UX protection.
// Checks for the session cookie presence and redirects to /login when absent.
// NOTE: real security is enforced by the backend (requireAuth middleware).
//       This middleware only prevents the flicker of protected pages before a 401.
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/favicon.ico"]);
const SESSION_COOKIE = "dash_sid";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths, Next.js internals, and static assets
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/")   ||  // Next.js API routes (none used here, just safe)
    pathname.startsWith("/images/") || // public/images/ — flags, icons, etc.
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)$/i)
  ) {
    return NextResponse.next();
  }

  const hasCookie = req.cookies.has(SESSION_COOKIE);

  if (!hasCookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname); // preserve return URL
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all request paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
