import { SignUp } from "@clerk/nextjs";

import { redirectIfSignedIn } from "@/lib/auth/viewer";

export const metadata = { title: "Sign up" };

// Reads the session, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** Same reason as the sign-in page: see the note there. */
export default async function SignUpPage() {
  await redirectIfSignedIn();

  return (
    <div className="flex justify-center py-10">
      <SignUp />
    </div>
  );
}
