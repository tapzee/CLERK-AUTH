import { redirect } from "next/navigation";
import { getViewerState, homePathFor } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard",
};

/**
 * Fallback route for Clerk or direct links that point to /dashboard.
 * Redirects the user directly to their respective workspace:
 * - Managers / Owners -> /manage
 * - Workers / Staff   -> /punch
 * - Signed out        -> /sign-in
 */
export default async function DashboardPage() {
  const state = await getViewerState();

  if (state.status === "signed-out") {
    redirect("/sign-in");
  }

  if (state.status === "not-enrolled") {
    redirect("/punch");
  }

  redirect(homePathFor(state.viewer));
}
