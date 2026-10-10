import { FocusTriadLogo } from "@/components/brand/FocusTriadLogo";

// Route-level loading for /onboarding — the welcome suite's own
// spinning mark, matching the build screen it precedes.
export default function OnboardingLoading() {
  return (
    <main className="dfl">
      <div className="dfl-body" style={{ justifyContent: "center", minHeight: "70svh" }}>
        <div className="dfl-bd">
          <FocusTriadLogo spin className="dfl-lgp" />
          <p className="dfl-bt">Loading…</p>
        </div>
      </div>
    </main>
  );
}
