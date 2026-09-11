export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Phase 2 restyle: the PRD §9.1 dark surface replaces the raw hex.
  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "var(--color-surface)", color: "var(--color-ink)" }}
    >
      {children}
    </div>
  );
}
