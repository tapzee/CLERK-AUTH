import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions inject attributes onto <html> before React hydrates
    // (ad blockers, password managers, and the like). suppressHydrationWarning
    // applies to this element's own attributes only -- one level deep -- so real
    // mismatches inside the tree are still reported.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ClerkProvider>
          <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
            <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
              <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground"
                >
                  {/* A clock face, drawn rather than an emoji so it inherits the accent. */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" />
                  </svg>
                </span>
                Shift
              </Link>

              <AppNav />
            </nav>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:py-10">{children}</main>

          <footer className="border-t border-border">
            <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted">
              Attendance photos are stored privately and served over short-lived signed URLs.
            </div>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
