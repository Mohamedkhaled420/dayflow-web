export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The welcome suite (landing / auth / onboarding / reset) paints
  // its own canvas via .dfw (token bridge + time-of-day sky wash)
  // — pass children straight through so nothing double-wraps.
  return <>{children}</>;
}
