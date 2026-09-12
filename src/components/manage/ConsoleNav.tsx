"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrent, type NavItem } from "@/app/manage/nav";

/**
 * The console's section links.
 *
 * A client component only because it needs `usePathname` to mark the current
 * section -- the list itself is filtered by permission on the server, so this
 * never receives a link the viewer is not allowed to follow.
 *
 * Renders as a sidebar from `md` up and as a scrolling tab strip below it,
 * which is how a manager uses it standing at a cart.
 */
export function ConsoleNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console sections">
      <ul
        className="
          -mx-1 flex gap-1 overflow-x-auto pb-1
          md:mx-0 md:flex-col md:overflow-visible md:pb-0
        "
      >
        {items.map((item) => {
          const current = isCurrent(item, pathname);

          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`
                  block rounded-xl px-3 py-2 text-sm transition
                  ${
                    current
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-surface-muted hover:text-foreground"
                  }
                `}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
