"use client";

// ============================================================
// Dayflow AI — auth page (Phase 2 restyle, Phase 5 passkeys
// — 2026-09 UX fix)
// ------------------------------------------------------------
// v0's logic is preserved 1:1 (mode state machine, Supabase
// sign-in / sign-up / Google OAuth, signup profile bootstrap,
// pending + error + message states). Phase 5 T4 adds the
// passkey path (Amendment #17).
//
// 2026-09 fix: the password form is now ALWAYS visible.
// Previously it hid itself whenever the server-side passkey
// probe succeeded — a first-time visitor with no enrolled
// passkey landed on a page whose only primary action was
// "Continue with Face ID", with the actual form tucked behind
// a fallback link. The passkey button still sits ABOVE the
// form when available, and the fallback chain (cancelled /
// failed ceremony reveals an inline error) still applies —
// but there is never a dead end, and no form flash on load.
// ============================================================

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LogoMark } from "@/components/brand/LogoMark";
import { BackgroundPaths } from "@/components/brand/BackgroundPaths";
import { Segmented } from "@/components/ui/Segmented";
import { passkeysServerEnabled, signInWithPasskey } from "@/lib/passkeys";
import { triggerHaptic } from "@/lib/haptics";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  // Passkey surface state (T4): the password form is ALWAYS
  // visible (2026-09 fix); the passkey button renders above it
  // only on capable browsers when the server feature is on.
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void passkeysServerEnabled().then((enabled) => {
      if (cancelled) return;
      setPasskeyAvailable(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    // Phase 4 bundle diet: the supabase-js chunk is imported on the
    // first submit instead of riding the initial payload — the login
    // form renders and hydrates without it.
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
          },
        });

    if (result.error) {
      setError(result.error.message.toLowerCase().includes("confirm") ? result.error.message : "Invalid email or password");
      setPending(false);
      return;
    }

    if (mode === "sign-up" && result.data.user) {
      // F-4 (Phase 8 / S1): no session means email confirmation is
      // pending. The pre-confirmation profile bootstrap upsert is
      // RLS-blocked by design (401), so it must NOT run before this
      // branch — show the intended "check your email" message first
      // and skip the bootstrap entirely; onboarding creates the
      // profile after the confirmed sign-in.
      if (!result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        setPending(false);
        return;
      }
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: result.data.user.id,
        identity: {
          displayName: email.split("@")[0],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          createdAt: new Date().toISOString(),
        },
        integrations: { browserExtensionLinked: false },
      });

      if (profileError) {
        setError("Your account was created, but profile setup could not be completed.");
        setPending(false);
        return;
      }
    }

    router.replace("/");
    router.refresh();
  }

  async function signInWithPasskeyFlow() {
    setError("");
    setPasskeyBusy(true);
    try {
      const { accessToken, refreshToken } = await signInWithPasskey();
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw new Error(sessionError.message);
      triggerHaptic();
      router.replace("/");
      router.refresh();
    } catch (e) {
      // Fallback chain (Amendment #17): cancelled ceremony, no
      // credential, or server refusal — the password form is
      // already on screen; surface an inline error instead.
      setError(
        e instanceof Error && e.message === "Passkey cancelled"
          ? ""
          : "Passkey sign-in didn't complete — use your email and password below."
      );
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) setError("Google sign in is unavailable right now.");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Phase 8: flowing-path backdrop — /auth ONLY (the
          authenticated app bans infinite path animations). */}
      <BackgroundPaths />
      {/* Phase 10: the auth card is a CREAM glass panel on the
          periwinkle day — the app's own material. */}
      <GlassPanel
        hairline="none"
        className="relative w-full max-w-md p-6 sm:p-8"
        style={{
          background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
          border: "0.5px solid var(--df-panel-border)",
          borderRadius: "var(--df-radius-panel)",
          boxShadow: "var(--df-hero-panel-shadow)",
        }}
      >
        <div>
          <LogoMark size={36} />
          <p className="mt-3 text-xs font-bold tracking-[0.22em] text-(--df-accent-text)">
            DAYFLOW AI
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-(--df-text-primary)">
            Your day, in flow.
          </h1>
          <p className="mt-2 text-sm leading-6 text-(--df-text-secondary)">
            A calm home for your timeline, habits, and weekly rhythm.
          </p>
        </div>

        <div className="mt-6">
          <Segmented
            label="Authentication mode"
            options={[
              { id: "sign-in", label: "Sign In" },
              { id: "sign-up", label: "Sign Up" },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value as "sign-in" | "sign-up");
              setError("");
              setMessage("");
            }}
          />
        </div>

        {/* Passkey first (Amendment #17): above the form when available. */}
        {passkeyAvailable && (
          <button
            type="button"
            onClick={signInWithPasskeyFlow}
            disabled={passkeyBusy || pending}
            className="df-press df-btn-primary mt-6 min-h-12 w-full px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <Fingerprint className="h-5 w-5" aria-hidden="true" />
              {passkeyBusy ? "Waiting for your passkey…" : "Continue with Face ID"}
            </span>
          </button>
        )}

        {passkeyAvailable && (
          <div className="my-5 flex items-center gap-3 text-xs text-(--df-text-muted)">
            <span className="h-px flex-1 bg-(--df-input-border)" />
            or with email
            <span className="h-px flex-1 bg-(--df-input-border)" />
          </div>
        )}

        <form className={passkeyAvailable ? "flex flex-col gap-4" : "mt-6 flex flex-col gap-4"} onSubmit={submit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-(--df-text-secondary)">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="df-input-glass min-h-12 px-4 text-base text-(--df-text-primary) outline-none transition-colors placeholder:text-(--df-text-muted)"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-(--df-text-secondary)">Password</span>
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              className="df-input-glass min-h-12 px-4 text-base text-(--df-text-primary) outline-none transition-colors placeholder:text-(--df-text-muted)"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-(--df-destructive-text)">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-sm text-(--df-accent-text)">
              {message}
            </p>
          ) : null}
          <button
            disabled={pending}
            type="submit"
            className="df-press df-btn-primary min-h-12 px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Please wait…" : mode === "sign-in" ? "Continue" : "Create account"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-(--df-text-muted)">
          <span className="h-px flex-1 bg-(--df-input-border)" />
          OR
          <span className="h-px flex-1 bg-(--df-input-border)" />
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="df-press df-btn-secondary min-h-12 w-full px-4 text-base font-semibold"
        >
          Continue with Google
        </button>
      </GlassPanel>
    </main>
  );
}
