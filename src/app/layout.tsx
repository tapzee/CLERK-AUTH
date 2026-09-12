import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Clock } from "lucide-react";

import { AppNav } from "@/components/AppNav";

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
  title: {
    default: "Shift — attendance for food carts",
    template: "%s · Shift",
  },
  description:
    "Selfie check-in with an automatic uniform check, shift times, and salary worked out from attendance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * Every Clerk flow lands on `/`, which routes by role -- console for a
     * manager or owner, camera for everyone else.
     *
     * Set here rather than left to the environment because these also override
     * the paths configured in the Clerk dashboard, which is otherwise free to
     * send people to a `/dashboard` or `/admin` this app has never had.
     */
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="flex min-h-full flex-col bg-background text-foreground selection:bg-accent/20 selection:text-accent">
          {/* Ambient lighting mesh */}
          <div className="ambient-mesh" aria-hidden="true" />

          {/* Sticky frosted glass header */}
          <header className="sticky top-0 z-30 border-b border-border/70 bg-surface-glass backdrop-blur-xl">
            <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link
                href="/"
                className="group flex items-center gap-2.5 font-bold tracking-tight text-foreground transition"
              >
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/20 transition-transform group-hover:scale-105"
                >
                  <Clock className="h-4 w-4 stroke-[2.5]" />
                </span>
                <span className="text-base font-bold tracking-tight">Shift</span>
              </Link>

              <AppNav />
            </nav>
          </header>

          <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </main>

          <footer className="relative z-10 border-t border-border/60 bg-surface-glass/40 backdrop-blur-sm">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted sm:px-6">
              <p>Shift · Intelligent Attendance, Uniform Verification &amp; Payroll</p>
              <p className="text-[11px] text-muted/80">
                Attendance photos are encrypted and served over short-lived signed URLs.
              </p>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
