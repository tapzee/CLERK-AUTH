import { redirectToHome } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

/**
 * A landing path this app does not really have.
 *
 * `/dashboard` is what most Clerk projects are pointed at by default, so a
 * dashboard setting nobody remembers changing — or an old bookmark — can still
 * send somebody here. Rather than a 404 at the end of a successful sign-in,
 * they are forwarded to whichever screen their role actually opens.
 */
export default async function DashboardPage() {
  await redirectToHome();
}
