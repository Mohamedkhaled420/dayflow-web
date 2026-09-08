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
  title: "Dayflow — A private, automatic work journal",
  description:
    "Dayflow turns your day into a clear timeline: daily standup prep, weekly review, and a chat interface grounded in your work journal. Open source, local-first, privacy-focused.",
  keywords: [
    "Dayflow",
    "work journal",
    "timeline",
    "time tracking",
    "daily standup",
    "weekly review",
  ],
  authors: [{ name: "Dayflow" }],
  openGraph: {
    title: "Dayflow — A private, automatic work journal",
    description:
      "Your day as a clear timeline. Daily standup, weekly review, and chat with your work journal.",
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
    <html lang="en" suppressHydrationWarning>
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
