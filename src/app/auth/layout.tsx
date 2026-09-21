export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Phase 10 "Lively Pastel": the auth surface rides the app's
  // df-token layer — periwinkle day (light) / deep plum (dark) —
  // instead of the PRD §9.1 dark surface, so sign-in matches the
  // rebranded app. (The §9.1 block itself stays verbatim in
  // theme.css; only this view's token CHOICE changed.)
  return (
    <div
      className="df-window min-h-screen font-sans"
    >
      {children}
    </div>
  );
}
