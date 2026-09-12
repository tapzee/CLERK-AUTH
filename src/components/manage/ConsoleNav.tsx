"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  ShieldAlert,
  Users,
  Store,
  Shirt,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";

import { isCurrent, type NavItem } from "@/app/manage/nav";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/manage": LayoutDashboard,
  "/manage/attendance": CalendarCheck,
  "/manage/review": ShieldAlert,
  "/manage/staff": Users,
  "/manage/carts": Store,
  "/manage/uniforms": Shirt,
  "/manage/payroll": CircleDollarSign,
};

export function ConsoleNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console sections">
      <ul
        className="
          -mx-1 flex gap-1.5 overflow-x-auto pb-1.5
          md:mx-0 md:flex-col md:overflow-visible md:pb-0 md:space-y-1
        "
      >
        {items.map((item) => {
          const current = isCurrent(item, pathname);
          const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;

          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                prefetch={true}
                aria-current={current ? "page" : undefined}
                className={`
                  flex min-h-10 items-center gap-2.5 rounded-[8px] px-3 text-sm font-medium tracking-[-0.01em] transition-colors duration-150 sm:min-h-0 sm:py-2 sm:text-[13px]
                  ${
                    current
                      ? "bg-ink text-ink-foreground"
                      : "text-muted hover:bg-surface-muted hover:text-foreground"
                  }
                `}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
