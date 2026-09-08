import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`; Clerk's
// handler is unchanged and still mounts as the default export here.
//
// This only makes the session available to `auth()` — it deliberately does no
// path matching. Clerk Core 3 deprecated `createRouteMatcher` because matching
// paths here can diverge from how Next.js actually routes a request, which can
// leave a protected resource reachable. Instead every page and route handler
// checks the session itself, right where it reads protected data.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry a query string.
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path.
    "/__clerk/:path*",
  ],
};
