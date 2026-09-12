import type { Permission } from "@/lib/auth/rbac";

/**
 * The console's sections, and the permission each one needs.
 *
 * Kept as data rather than as markup so the sidebar, the mobile tab strip and
 * the overview's shortcut cards all read from the same list. A section a role
 * cannot use is not rendered at all -- the page behind it checks the same
 * permission again, because hiding a link is a courtesy and not a control.
 */
export type NavItem = {
  href: string;
  label: string;
  description: string;
  permission: Permission;
  /** Matches child routes too, e.g. /manage/staff/new. */
  prefix?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/manage",
    label: "Overview",
    description: "Today at a glance.",
    permission: "console:read",
  },
  {
    href: "/manage/attendance",
    label: "Attendance",
    description: "Who came in, when, and how late.",
    permission: "attendance:read:team",
    prefix: true,
  },
  {
    href: "/manage/review",
    label: "Uniform review",
    description: "Punches the check could not settle.",
    permission: "attendance:review",
    prefix: true,
  },
  {
    href: "/manage/staff",
    label: "Staff",
    description: "Shifts, grace, salary and roles.",
    permission: "staff:read",
    prefix: true,
  },
  {
    href: "/manage/carts",
    label: "Carts",
    description: "Where a punch has to be taken from.",
    permission: "cart:read",
    prefix: true,
  },
  {
    href: "/manage/uniforms",
    label: "Uniforms",
    description: "What the check is looking for.",
    permission: "uniform:write",
    prefix: true,
  },
  {
    href: "/manage/payroll",
    label: "Payroll",
    description: "Prepare, approve and pay.",
    permission: "payroll:read",
    prefix: true,
  },
];

/** True when a nav item should render as the current page. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  return item.prefix ? pathname.startsWith(item.href) : pathname === item.href;
}
