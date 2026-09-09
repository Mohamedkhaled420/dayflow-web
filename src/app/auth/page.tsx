"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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
      <section className="w-full max-w-md rounded-2xl border border-white/12 bg-[#151a22] p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#a6f0d0]">DAYFLOW AI</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Your day, in flow.</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">A calm home for your timeline, habits, and weekly rhythm.</p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-white/6 p-1">
          {(["sign-in", "sign-up"] as const).map((value) => (
            <button key={value} type="button" onClick={() => { setMode(value); setError(""); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === value ? "bg-white text-[#0e1117]" : "text-white/60 hover:text-white"}`}>
              {value === "sign-in" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2 text-sm text-white/70">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-xl border border-white/12 bg-white/6 px-3 py-3 text-white outline-none transition focus:border-[#a6f0d0]" /></label>
          <label className="flex flex-col gap-2 text-sm text-white/70">Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-xl border border-white/12 bg-white/6 px-3 py-3 text-white outline-none transition focus:border-[#a6f0d0]" /></label>
          {error ? <p role="alert" className="text-sm text-[#ff9b9b]">{error}</p> : null}
          {message ? <p role="status" className="text-sm text-[#a6f0d0]">{message}</p> : null}
          <button disabled={pending} type="submit" className="rounded-xl bg-[#a6f0d0] px-4 py-3 font-semibold text-[#0e1117] transition hover:bg-[#c3f8e1] disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Please wait…" : mode === "sign-in" ? "Continue" : "Create account"}</button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-white/35"><span className="h-px flex-1 bg-white/10" />OR<span className="h-px flex-1 bg-white/10" /></div>
        <button type="button" onClick={signInWithGoogle} className="w-full rounded-xl border border-white/12 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/6">Continue with Google</button>
      </section>
    </main>
  );
}
