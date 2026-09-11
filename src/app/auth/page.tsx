"use client";

// ============================================================
// Dayflow AI — auth page (Phase 2 restyle, Phase 5 passkeys)
// ------------------------------------------------------------
// v0's logic is preserved 1:1 (mode state machine, Supabase sign-in /
// sign-up / Google OAuth, signup profile bootstrap, pending + error
// + message states). Phase 5 T4 adds the passkey path (Amendment #17):
// "Continue with Face ID" sits above the other options, and the
// password form is REVEALED by the fallback chain — passkeys
// unavailable, disabled server-side, cancelled, or failed all land
// there. Never a dead end.
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

  // Passkey surface state (T4). The password form starts REVEALED on
  // browsers without passkey support; on capable browsers it waits
  // behind "Use email and password instead" until the fallback fires.
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(true);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void passkeysServerEnabled().then((enabled) => {
      if (cancelled) return;
      setPasskeyAvailable(enabled);
      setShowPasswordForm(!enabled);
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
      // MANDATORY fallback chain: cancelled ceremony, no credential,
      // or server refusal — always land on the password form.
      setShowPasswordForm(true);
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
      <GlassPanel className="relative w-full max-w-md p-6 sm:p-8">
        <div>
          <LogoMark size={36} />
          <p className="mt-3 text-xs font-semibold tracking-[0.22em] text-(--color-accent-focus)">
            DAYFLOW AI
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-(--color-ink)">
            Your day, in flow.
          </h1>
          <p className="mt-2 text-sm leading-6 text-(--color-ink-muted)">
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

        {/* Passkey first (Amendment #17): above every other option. */}
        {passkeyAvailable && (
          <button
            type="button"
            onClick={signInWithPasskeyFlow}
            disabled={passkeyBusy || pending}
            className="mt-6 min-h-12 w-full rounded-(--radius-pill) bg-(--color-ink) px-4 text-base font-semibold text-(--color-accent-focus) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <Fingerprint className="h-5 w-5" aria-hidden="true" />
              {passkeyBusy ? "Waiting for your passkey…" : "Continue with Face ID"}
            </span>
          </button>
        )}

        {passkeyAvailable && !showPasswordForm && (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            className="mt-4 min-h-11 w-full rounded-(--radius-pill) px-4 text-sm font-medium text-(--color-ink-muted) transition-colors hover:bg-(--color-surface-subtle)"
          >
            Use email and password instead
          </button>
        )}

        {showPasswordForm && (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-(--color-ink-muted)">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="min-h-12 rounded-(--radius-panel) border border-(--hairline) bg-(--color-surface-subtle) px-4 text-base text-(--color-ink) outline-none transition-colors placeholder:text-(--color-ink-faint) focus:border-(--hairline-accent)"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-(--color-ink-muted)">Password</span>
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              className="min-h-12 rounded-(--radius-panel) border border-(--hairline) bg-(--color-surface-subtle) px-4 text-base text-(--color-ink) outline-none transition-colors placeholder:text-(--color-ink-faint) focus:border-(--hairline-accent)"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-(--df-destructive)">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="text-sm text-(--color-accent-focus)">
              {message}
            </p>
          ) : null}
          <button
            disabled={pending}
            type="submit"
            className="min-h-12 rounded-(--radius-pill) bg-(--color-ink) px-4 text-base font-semibold text-(--color-accent-focus) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Please wait…" : mode === "sign-in" ? "Continue" : "Create account"}
          </button>
        </form>
        )}

        <div className="my-6 flex items-center gap-3 text-xs text-(--color-ink-faint)">
          <span className="h-px flex-1 bg-(--hairline)" />
          OR
          <span className="h-px flex-1 bg-(--hairline)" />
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="min-h-12 w-full rounded-(--radius-pill) border border-(--hairline) px-4 text-base font-medium text-(--color-ink) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:bg-(--color-surface-subtle) active:scale-[0.98]"
        >
          Continue with Google
        </button>
      </GlassPanel>
    </main>
  );
}
