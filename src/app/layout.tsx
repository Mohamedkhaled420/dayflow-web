import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DeferredToaster } from "@/components/ui/deferred-toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/dayflow/ServiceWorkerRegistrar";
import { PWA_SURFACE_COLORS } from "@/styles/palette";

const figtree = Figtree({
  variable: "--font-figtree",
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
    statusBarStyle: "default",
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
  // the tab dock respects env(safe-area-inset-bottom).
  viewportFit: "cover",
  // Phase 4 ship: flat --color-surface (#0e1117) so the browser chrome
  // matches the installed PWA shell (manifest theme_color). The previous
  // light/dark media pair lives on in THEME_META_COLORS if the design
  // system ever wants per-scheme chrome back.
  themeColor: PWA_SURFACE_COLORS.theme,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body
        className={`${figtree.variable} ${geistMono.variable} font-sans antialiased`}
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
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
