import type { Metadata, Viewport } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DeferredToaster } from "@/components/ui/deferred-toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/dayflow/ServiceWorkerRegistrar";
import { ChromeThemeSync } from "@/components/dayflow/ChromeThemeSync";
import { THEME_META_COLORS } from "@/styles/palette";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dayflow — Your personal life tracker",
  description:
    "Dayflow tracks what matters to you — workouts, work time, personal projects, sleep, water, and meals — as a clear daily timeline with habit streaks, weekly reviews, and a grounded chat. Local-first and privacy-focused.",
  keywords: [
    "Dayflow",
    "habit tracker",
    "life tracker",
    "fitness log",
    "sleep tracker",
    "water intake",
    "time tracking",
    "weekly review",
  ],
  authors: [{ name: "Dayflow" }],
  appleWebApp: {
    capable: true,
    title: "Dayflow",
    // black-translucent: the installed app paints edge-to-edge (under the
    // notch / Dynamic Island); the mobile header already pads
    // var(--safe-area-top). ChromeThemeSync swaps this to "default"
    // while the LIGHT theme is active so the status-bar text stays
    // readable on the light header.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // PWA install surface (Phase 4): web app manifest + Apple touch icon.
  manifest: "/manifest.json",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Dayflow — Your personal life tracker",
    description:
      "Workouts, work, sleep, water, and meals on one timeline. Habit streaks, weekly reviews, and chat with your data.",
    siteName: "Dayflow",
    type: "website",
  },
};

export const viewport: Viewport = {
  // viewportFit=cover lets the app paint under the notch/home indicator;
  // the tab dock respects var(--safe-area-bottom).
  viewportFit: "cover",
  // Browser chrome must BLEND with the app surface or the phone reads
  // "website", not "app": the address-bar area is tinted per color
  // scheme (light chrome on light, dark on dark). THEME_META_COLORS
  // values mirror --df-window-bg in theme.css (#A5B4FC light /
  // #1E1B2E dark). ChromeThemeSync re-syncs this meta when the user
  // toggles the in-app theme manually (the media pair only reacts to
  // the OS scheme).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_META_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_META_COLORS.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body
        className={`${nunito.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* Deferred until the first toast (Phase 4 bundle diet) — the
              radix toast chunk never rides the initial payload. */}
          <DeferredToaster />
          {/* Keeps the browser chrome + iOS status bar in lock-step with
              the ACTIVE theme (manual toggles included). */}
          <ChromeThemeSync />
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
