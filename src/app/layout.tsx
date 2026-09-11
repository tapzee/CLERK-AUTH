import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Live Photos",
  description: "Capture photos from your camera and store them privately in Supabase.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions inject attributes onto <html> before React hydrates
    // (ad blockers, password managers, and the like). suppressHydrationWarning
    // applies to this element's own attributes only — one level deep — so real
    // mismatches inside the tree are still reported.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ClerkProvider>
          <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
            <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
              <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground"
                >
                  {/* Aperture mark, drawn rather than an emoji so it inherits the accent. */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3.2" />
                  </svg>
                </span>
                Live Photos
              </Link>

              <div className="flex items-center gap-1.5 text-sm">
                <Show when="signed-in">
                  <Link
                    href="/attendance"
                    className="rounded-full px-3.5 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground"
                  >
                    Attendance
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-full px-3.5 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground"
                  >
                    Gallery
                  </Link>
                  <Link
                    href="/camera"
                    className="rounded-full px-3.5 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground"
                  >
                    Camera
                  </Link>
                  <span className="ml-1.5 flex items-center">
                    <UserButton />
                  </span>
                </Show>

                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button className="rounded-full px-4 py-1.5 text-muted transition hover:bg-surface-muted hover:text-foreground">
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="rounded-full bg-accent px-4 py-1.5 font-medium text-accent-foreground transition hover:opacity-90">
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
              </div>
            </nav>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

          <footer className="border-t border-border">
            <div className="mx-auto max-w-5xl px-6 py-5 text-xs text-muted">
              Photos are stored in a private bucket and served over short-lived signed URLs.
            </div>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
