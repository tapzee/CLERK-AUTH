import { redirectToHome } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

/**
 * The other path people arrive on by habit. The console lives at `/manage`;
 * see the note in `dashboard/page.tsx` for why this exists at all.
 */
export default async function AdminPage() {
  await redirectToHome();
}
