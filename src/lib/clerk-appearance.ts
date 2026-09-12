/**
 * Clerk's widgets, pulled into the app's own design language.
 *
 * Set once on `ClerkProvider` so the sign-up modal on the landing page, the
 * user button menu and the full sign-in page all agree.
 *
 * The values are the CSS custom properties from `globals.css` rather than
 * literal colours, so the widgets follow the light and dark palettes without a
 * second copy of them living here. `colorNeutral` is the one exception: Clerk
 * derives a whole alpha scale from it, which needs a real colour to mix.
 */
export const clerkAppearance = {
  variables: {
    fontFamily: "var(--font-instrument-sans)",
    fontFamilyMono: "var(--font-jetbrains-mono)",
    fontSize: "0.8125rem",
    borderRadius: "10px",

    colorBackground: "var(--surface)",
    colorForeground: "var(--foreground)",
    colorMuted: "var(--surface-muted)",
    colorMutedForeground: "var(--muted)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",

    // Primary actions are ink, the same as `.btn-primary`.
    colorPrimary: "var(--ink)",
    colorPrimaryForeground: "var(--ink-foreground)",

    colorInput: "var(--surface)",
    colorInputForeground: "var(--foreground)",

    colorDanger: "var(--danger)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
  },
  elements: {
    // Clerk stacks its card on a heavy shadow and rounds it hard; this app
    // frames things with a hairline instead. The `!` prefixes are needed
    // because Clerk's own rules are more specific than a plain utility.
    cardBox: "!shadow-none !rounded-[14px] border border-border overflow-hidden",
    card: "!shadow-none !border-none",
    footer: "!shadow-none",
    headerTitle: "tracking-[-0.01em]",

    // `max-sm:` rules are the phone pass: Clerk's own scale puts fields at
    // 36px and 13px, which is under a comfortable thumb target and small
    // enough that iOS Safari zooms the page when a field takes focus.
    formFieldInput:
      "!shadow-none !border !border-border max-sm:!text-base max-sm:!min-h-11",
    formButtonPrimary:
      "!shadow-none normal-case tracking-normal max-sm:!min-h-11",
    socialButtonsBlockButton: "!shadow-none !border !border-border max-sm:!min-h-11",
    formFieldInputShowPasswordButton: "max-sm:!min-h-11 max-sm:!min-w-11",
    // Padding rather than min-height: it widens the hit area without taking
    // the link out of its sentence and onto its own line.
    footerActionLink: "max-sm:!px-1 max-sm:!py-2.5",
  },
} as const;
