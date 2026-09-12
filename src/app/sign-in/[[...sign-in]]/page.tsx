import { SignIn } from "@clerk/nextjs";

import { redirectIfSignedIn } from "@/lib/auth/viewer";

export const metadata = { title: "Sign in" };

// Reads the session, so it can never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Clerk runs in single-session mode, so `<SignIn/>` refuses to render for
 * somebody who is already signed in -- it shows a developer notice instead of a
 * screen. Sending them on before it mounts is what keeps that from happening.
 */
export default async function SignInPage() {
  await redirectIfSignedIn();

  return (
    <div className="flex justify-center py-10">
      <SignIn />
    </div>
  );
}
