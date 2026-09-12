import Link from "next/link";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { can } from "@/lib/auth/rbac";
import { getViewerState } from "@/lib/auth/viewer";

/**
 * The header links, chosen by role.
 *
 * A server component, so it reads the session directly.
 */
export async function AppNav() {
  const state = await getViewerState();

  if (state.status === "signed-out") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <SignInButton mode="modal">
          <button className="rounded-full px-4 py-1.5 font-medium text-muted transition hover:bg-surface-muted hover:text-foreground">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="btn btn-primary py-1.5 text-xs shadow-sm sm:text-sm">
            Sign up
          </button>
        </SignUpButton>
      </div>
    );
  }

  const links: { href: string; label: string }[] = [];

  if (state.status === "enrolled") {
    // An owner does not clock in or draw a salary through this system -- see
    // the `WORKER` permission split in rbac.ts -- so neither link is offered
    // to them; both would only lead to a screen that refuses them.
    if (can(state.viewer.role, "attendance:punch")) {
      links.push({ href: "/punch", label: "Punch" });
    }
    if (can(state.viewer.role, "attendance:read:own")) {
      links.push({ href: "/me", label: "My record" });
    }
    if (can(state.viewer.role, "console:read")) {
      links.push({ href: "/manage", label: "Console" });
    }
  } else {
    // Not enrolled yet: /punch is also where enrolment is explained, so it is
    // the one link worth offering before a role exists to check.
    links.push({ href: "/punch", label: "Punch" });
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-surface/60 p-1 backdrop-blur-md">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-3.5 py-1 text-xs font-medium text-muted transition-all duration-150 hover:bg-surface-muted hover:text-foreground sm:text-sm"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="ml-1 flex items-center">
        <UserButton />
      </div>
    </div>
  );
}
