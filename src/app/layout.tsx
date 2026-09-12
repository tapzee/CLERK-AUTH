import type { Metadata } from "next";
import Link from "next/link";
import {
  Instrument_Sans,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { AppNav } from "@/components/AppNav";
import { clerkAppearance } from "@/lib/clerk-appearance";

import "./globals.css";

/**
 * Three faces, each with one job: the sans for interface text, the serif for
 * display headings on the public pages, and the mono for anything that is a
 * number, a time, or a status.
 */
const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
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
      appearance={clerkAppearance}
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
        className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="flex min-h-full flex-col bg-background text-foreground">
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
            <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:h-14 sm:gap-4 sm:px-8">
              <Link
                href="/"
                className="-ml-1 flex min-h-11 items-center px-1 text-base font-semibold tracking-[-0.02em] text-foreground sm:min-h-0 sm:text-[15px]"
              >
                Shift<span className="text-accent">.</span>
              </Link>

              <AppNav />
            </nav>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
            {children}
          </main>

          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-5xl flex-col gap-1.5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="text-[13px] text-muted sm:text-xs">
                Shift — attendance, uniform checks and payroll for food carts.
              </p>
              <p className="font-mono text-xs text-faint sm:text-[11px]">
                Photos encrypted · signed URLs
              </p>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
