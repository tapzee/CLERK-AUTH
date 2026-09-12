import { redirectIfSignedIn } from "@/lib/auth/viewer";
import { RoleSignInView } from "@/components/auth/RoleSignInView";

export const metadata = { title: "Sign in" };

// Reads the session, so it can never be prerendered.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  await redirectIfSignedIn();

  return (
    <div className="flex justify-center px-2 py-4 sm:py-8">
      <RoleSignInView />
    </div>
  );
}
