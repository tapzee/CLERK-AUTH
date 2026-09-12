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
      <div className="flex items-center gap-1">
        <SignInButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
          <button className="btn btn-quiet py-1.5 text-[13px]">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal" fallbackRedirectUrl="/" forceRedirectUrl="/">
          <button className="btn btn-primary py-1.5 text-[13px]">Sign up</button>
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
    <div className="flex items-center gap-1 sm:gap-2">
      <nav className="flex items-center gap-0.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            className="rounded-[8px] px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
      <UserButton />
    </div>
  );
}
