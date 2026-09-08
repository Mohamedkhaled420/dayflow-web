import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

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
  openGraph: {
    title: "Dayflow — Your personal life tracker",
    description:
      "Workouts, work, sleep, water, and meals on one timeline. Habit streaks, weekly reviews, and chat with your data.",
    siteName: "Dayflow",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFE6E0" },
    { media: "(prefers-color-scheme: dark)", color: "#313348" },
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
        className={`${figtree.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
