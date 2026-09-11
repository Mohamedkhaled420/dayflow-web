"use client";

// ============================================================
// Dayflow AI — auth page (Phase 2 restyle)
// ------------------------------------------------------------
// v0's logic is preserved 1:1 (mode state machine, Supabase sign-in /
// sign-up / Google OAuth, signup profile bootstrap, pending + error
// + message states). Only the presentation changed: every value now
// comes from src/styles/theme.css tokens, the card is a GlassPanel,
// and the mode toggle is the Segmented primitive.
// ============================================================

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Segmented } from "@/components/ui/Segmented";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
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

      if (!result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        setPending(false);
        return;
      }
    }

    router.replace("/");
    router.refresh();
  }

  async function signInWithGoogle() {
    setError("");
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
    <main className="flex min-h-screen items-center justify-center p-4">
      <GlassPanel className="w-full max-w-md p-6 sm:p-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-(--color-accent-focus)">
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
