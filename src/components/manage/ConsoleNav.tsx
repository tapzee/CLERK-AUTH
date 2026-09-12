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
                  group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold tracking-tight transition-all duration-150 sm:text-sm
                  ${
                    current
                      ? "bg-accent text-accent-foreground shadow-sm shadow-accent/25"
                      : "text-muted hover:bg-surface hover:text-foreground border border-transparent hover:border-border/40"
                  }
                `}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                    current ? "text-accent-foreground" : "text-muted group-hover:text-foreground"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
