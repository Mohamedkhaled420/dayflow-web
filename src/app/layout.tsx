import type { Metadata, Viewport } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DeferredToaster } from "@/components/ui/deferred-toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/focus-triad/ServiceWorkerRegistrar";
import { ChromeThemeSync } from "@/components/focus-triad/ChromeThemeSync";
import { CircadianThemeSync } from "@/components/focus-triad/CircadianThemeSync";
import { ErrorReporter } from "@/components/focus-triad/ErrorReporter";
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
  title: "Focus Triad — Your personal life tracker",
  description:
    "Focus Triad tracks what matters to you — workouts, work time, personal projects, sleep, water, and meals — as a clear daily timeline with habit streaks, weekly reviews, and a grounded chat. Local-first and privacy-focused.",
  keywords: [
    "Focus Triad",
    "habit tracker",
    "life tracker",
    "fitness log",
    "sleep tracker",
    "water intake",
    "time tracking",
    "weekly review",
  ],
  authors: [{ name: "Focus Triad" }],
  appleWebApp: {
    capable: true,
    title: "Focus Triad",
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
    title: "Focus Triad — Your personal life tracker",
    description:
      "Workouts, work, sleep, water, and meals on one timeline. Habit streaks, weekly reviews, and chat with your data.",
    siteName: "Focus Triad",
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
        {/* Circadian pre-paint: runs BEFORE next-themes' bootstrap
            script (document order), so a "time of day" user's very
            first frame is already the right theme — no flash. It
            aligns next-themes' stored value with the clock AND
            stamps the preference as "auto" so the controller knows
            it owns the theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{var M={"dayflow-theme-pref":"ft-theme-pref","dayflow-morning-triad-v1":"ft-morning-triad-v1","dayflow-sky-off":"ft-sky-off","dayflow-sky-preview":"ft-sky-preview","dayflow-haptics-off":"ft-haptics-off","dayflow-companion-progress-v1":"ft-companion-progress-v1","dayflow-sync-v1":"ft-sync-v1","dayflow.coach.turns.v1":"ft.coach.turns.v1","dayflow.coach.notes.v1":"ft.coach.notes.v1","dayflow:recent-blocks":"ft:recent-blocks","dayflow:meal-recents":"ft:meal-recents"};for(var k in M){var v=localStorage.getItem(k);if(v!==null&&localStorage.getItem(M[k])===null)localStorage.setItem(M[k],v);localStorage.removeItem(k)}}catch(e){}try{var p=localStorage.getItem("ft-theme-pref");var s=localStorage.getItem("theme");if(p==="auto"||(!p&&!s)){var d=new Date();var h=d.getHours()+d.getMinutes()/60;var k=(h>=17||h<5)?"dark":"light";try{localStorage.setItem("theme",k);localStorage.setItem("ft-theme-pref","auto")}catch(e){}}}catch(e){}})();`,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
        >
          {children}
          {/* Deferred until the first toast (Phase 4 bundle diet) — the
              radix toast chunk never rides the initial payload. */}
          <DeferredToaster />
          {/* Keeps the browser chrome + iOS status bar in lock-step with
              the ACTIVE theme (manual toggles included). */}
          <ChromeThemeSync />
          {/* The time-of-day app theme: light by day, dark by evening /
              night — only while the preference is "time of day". */}
          <CircadianThemeSync />
          {/* In-house error monitoring (audit P0-4): global JS errors
              and rejections → /api/client-errors → error_events. */}
          <ErrorReporter />
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
