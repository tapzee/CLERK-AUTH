import Link from "next/link";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { can } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";

/**
 * The header links, chosen by role.
 *
 * A server component, so it reads the session directly rather than shipping the
 * permission table to the browser and deciding there. It shares the same
 * request-scoped `getViewerState` as the page beneath it, so this costs no
 * extra database read.
 */
export async function AppNav() {
  const state = await getViewerState();

  if (state.status === "signed-out") {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <SignInButton mode="modal">
          <button className="rounded-full px-4 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="btn btn-primary">Sign up</button>
        </SignUpButton>
      </div>
    );
  }

  // Enrolled or not, a signed-in person gets the punch screen: when they are
  // not enrolled it is the page that tells them what to do about it.
  const links = [{ href: "/punch", label: "Punch" }];

  if (state.status === "enrolled") {
    links.push({ href: "/me", label: "My record" });
    if (can(state.viewer.role, "console:read")) {
      links.push({ href: "/manage", label: "Console" });
    }
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full px-3.5 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
      <span className="ml-1.5 flex items-center">
        <UserButton />
      </span>
    </div>
  );
}
