import { DayflowLogo } from "@/components/brand/DayflowLogo";

// Route-level loading for /onboarding — the welcome suite's own
// spinning mark, matching the build screen it precedes.
export default function OnboardingLoading() {
  return (
    <main className="dfl">
      <div className="dfl-body" style={{ justifyContent: "center", minHeight: "70svh" }}>
        <div className="dfl-bd">
          <DayflowLogo spin className="dfl-lgp" />
          <p className="dfl-bt">Loading…</p>
        </div>
      </div>
    </main>
  );
}
