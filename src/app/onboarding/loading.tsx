import { GlassPanel } from "@/components/ui/GlassPanel";
import { LogoLoop } from "@/components/brand/LogoLoop";

// Phase 6.5 (B3): route-level loading for /onboarding — md loop
// centered in a GlassPanel. Never a fullscreen wall (PRD §7).
export default function OnboardingLoading() {
  return (
    <main className="df-window w-full min-h-[100dvh] overflow-x-hidden sm:p-[15px]">
      <div className="mx-auto flex max-w-[560px] items-center justify-center p-6">
        <GlassPanel className="grid w-full place-items-center px-6 py-14">
          <div className="flex flex-col items-center gap-4">
            <LogoLoop size="md" label="Loading onboarding" />
            <p
              className="text-[11px] leading-none"
              style={{ color: "var(--df-text-muted)" }}
            >
              Loading…
            </p>
          </div>
        </GlassPanel>
      </div>
    </main>
  );
}
