"use client";

// ============================================================
// Dayflow AI — auth page (reference mockup "Dayflow (6)"
// authHTML, ported 1:1 + real Supabase wiring)
// ------------------------------------------------------------
// Email + password only (Google OAuth dropped — not configured
// on the Supabase project). "Continue with Face ID" keeps the
// real passkey path and renders only when the server supports
// WebAuthn (it 404s on this project today, so the email form is
// the primary surface). "Try it first" enters as an anonymous
// guest (Supabase anonymous users — data upgrades when they
// create an account later in Settings).
//
// Behavior notes:
// - mailer_autoconfirm is ON server-side, so signUp returns a
//   session instantly and the middleware routes to /onboarding.
// - Forgot password sends a REAL recovery email whose link
//   lands on /auth/callback?next=/auth/reset (new-password form).
// - ?mode=up|in preselects the segment (landing CTAs); ?guest=1
//   auto-starts the guest flow.
// ============================================================

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { DayflowLogo } from "@/components/brand/DayflowLogo";
import { SkySync } from "@/components/dayflow/SkySync";
import { passkeysServerEnabled, signInWithPasskey } from "@/lib/passkeys";
import { haptic } from "@/lib/haptics";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const FI_ICON = (
  <svg viewBox="0 0 24 24">
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1.5M15 10v1.5M12 10v3.5h-1M9 16c1.7 1.2 4.3 1.2 6 0" />
  </svg>
);

/* the reference's pwScore: 0..4 */
function pwScore(p: string) {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) n++;
  if (/[^A-Za-z0-9]/.test(p)) n++;
  return Math.min(4, p ? Math.max(n, 1) : 0);
}
const PW_LABELS = ["", "Weak", "Okay", "Good", "Strong"];

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Try again.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many tries — take a breath and try again in a minute.";
  if (m.includes("password should be"))
    return "Use at least 8 characters.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Enter a valid email address.";
  if (m.includes("anonymous"))
    return "Guest mode is unavailable right now — create an account instead.";
  return message;
}

function AuthView() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<"in" | "up">(
    params.get("mode") === "up" ? "up" : "in",
  );
  const up = mode === "up";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  /* logo life: spin while typing (reference .lgs.spin), jump on error */
  const [logoSpin, setLogoSpin] = useState(false);
  const [logoJump, setLogoJump] = useState(0);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeLogo = () => {
    setLogoSpin(true);
    if (spinTimer.current) clearTimeout(spinTimer.current);
    spinTimer.current = setTimeout(() => setLogoSpin(false), 700);
  };

  /* passkey surface (renders only when the server supports it) */
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void passkeysServerEnabled().then((enabled) => {
      if (!cancelled) setPasskeyAvailable(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const emailOk = EMAIL_RE.test(email.trim());
  const score = useMemo(() => pwScore(password), [password]);

  function showError(m: string) {
    setError(m);
    setMessage("");
    setLogoJump((n) => n + 1);
    haptic(30);
  }

  /* ---- the real flows ---- */

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setMessage("");

    const em = email.trim();
    if (!EMAIL_RE.test(em)) return showError("Enter a valid email address.");
    if (password.length < 8) return showError("Use at least 8 characters.");

    setPending(true);
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const result = up
      ? await supabase.auth.signUp({
          email: em,
          password,
          options: {
            emailRedirectTo:
              process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
              `${window.location.origin}/auth/callback`,
          },
        })
      : await supabase.auth.signInWithPassword({ email: em, password });

    if (result.error) {
      showError(friendlyError(result.error.message));
      setPending(false);
      return;
    }

    /* Sign-up with an instant session (autoconfirm is on):
       bootstrap the profile row, then let the middleware route
       to /onboarding for the wake-time survey. If email
       confirmation ever gets re-enabled, the no-session branch
       keeps the "check your email" message. */
    if (up && result.data.user) {
      if (!result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        setPending(false);
        return;
      }
      await supabase.from("profiles").upsert({
        id: result.data.user.id,
        identity: {
          displayName: em.split("@")[0],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          createdAt: new Date().toISOString(),
        },
        integrations: { browserExtensionLinked: false },
      });
    }

    router.replace("/");
    router.refresh();
  }

  async function enterAsGuest() {
    if (guestBusy || pending) return;
    setGuestBusy(true);
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      haptic([10, 40, 10]);
      router.replace("/");
      router.refresh();
    } catch (e) {
      showError(
        e instanceof Error ? friendlyError(e.message) : "Could not start guest mode.",
      );
      setGuestBusy(false);
    }
  }

  async function sendReset() {
    setError("");
    const em = email.trim();
    if (!EMAIL_RE.test(em)) {
      showError("Enter your email first.");
      return;
    }
    setPending(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (resetError) throw resetError;
      setMessage(`Reset link sent to ${em}`);
    } catch (e) {
      showError(e instanceof Error ? friendlyError(e.message) : "Could not send the reset email.");
    } finally {
      setPending(false);
    }
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
      haptic();
      router.replace("/");
      router.refresh();
    } catch (e) {
      showError(
        e instanceof Error && e.message === "Passkey cancelled"
          ? ""
          : "Passkey sign-in didn't complete — use your email and password below.",
      );
    } finally {
      setPasskeyBusy(false);
    }
  }

  /* ?guest=1 no longer auto-runs here — the landing's "Try it
     first" enters guest mode in place; this page keeps its own
     manual "Try it first" button in the dock. */

  return (
    <main className="dfl">
      <SkySync />
      <div className="dfl-body">
        {/* header: back + the live logo */}
        <div className="dfl-head">
          <Link className="dfl-back" href="/" aria-label="Back">
            ‹
          </Link>
          <DayflowLogo
            live
            spin={logoSpin}
            jump={logoJump > 0}
            key={`lgs-${logoJump}`}
            className="dfl-lgs"
          />
          <span style={{ width: 44 }} />
        </div>

        <div className="dfl-title">
          <h1>{up ? "Create your account" : "Welcome back"}</h1>
          <p className="dfl-sub">
            {up
              ? "Two fields and you are in. Your coach gets to know you next."
              : "Pick up where your day left off."}
          </p>
        </div>

        <div className="dfl-seg" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={up ? "" : "on"}
            onClick={() => {
              setMode("in");
              setError("");
              setMessage("");
              haptic(4);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={up ? "on" : ""}
            onClick={() => {
              setMode("up");
              setError("");
              setMessage("");
              haptic(4);
            }}
          >
            Create account
          </button>
        </div>

        {up ? null : passkeyAvailable ? (
          <>
            <button
              type="button"
              className="dfl-fid"
              onClick={() => void signInWithPasskeyFlow()}
              disabled={passkeyBusy || pending}
            >
              {FI_ICON}
              <span>{passkeyBusy ? "Waiting for your passkey…" : "Continue with Face ID"}</span>
            </button>
            <div className="dfl-or">or use email</div>
          </>
        ) : null}

        <form id="dfl-go" onSubmit={submit} noValidate>
          <div className={`dfl-fw${emailOk ? " ok" : ""}`}>
            <input
              className="dfl-in"
              id="dfl-email"
              type="email"
              inputMode="email"
              placeholder="Email"
              autoComplete="email"
              aria-label="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                nudgeLogo();
              }}
            />
            <svg className="dfl-ck" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>

          <div className="dfl-pw" style={{ marginTop: 12 }}>
            <input
              className="dfl-in"
              id="dfl-password"
              type={showPw ? "text" : "password"}
              placeholder="Password (8+ characters)"
              autoComplete={up ? "new-password" : "current-password"}
              aria-label="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                nudgeLogo();
              }}
            />
            <button
              type="button"
              onClick={() => {
                setShowPw((s) => !s);
                haptic(4);
              }}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          {up ? (
            <div className="dfl-meter" style={{ marginTop: 12 }} aria-hidden="true">
              <div className="dfl-mb">
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={i < score ? `on l${score}` : ""} />
                ))}
              </div>
              <span className="dfl-ml">{PW_LABELS[score]}</span>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="dfl-forgot" onClick={() => void sendReset()}>
                Forgot password?
              </button>
            </div>
          )}

          <div className="dfl-err sh" role="alert" key={`err-${error}`}>
            {error}
          </div>
          {message ? (
            <p className="dfl-sub" role="status" style={{ marginTop: -6, marginBottom: 4 }}>
              {message}
            </p>
          ) : null}
        </form>

        {/* dock */}
        <div className="dfl-dock">
          <div className="dfl-dockc">
            <button
              type="submit"
              form="dfl-go"
              className={`dfl-btn${pending ? " ld" : ""}`}
              disabled={pending}
            >
              <span>
                {pending
                  ? up
                    ? "Creating your account…"
                    : "Signing you in…"
                  : up
                    ? "Create account"
                    : "Sign in"}
              </span>
            </button>
            <div className="dfl-dock2">
              <button type="button" onClick={() => void enterAsGuest()} disabled={guestBusy}>
                {guestBusy ? "Setting you up…" : up ? "Try it first, no account" : "Try it first"}
              </button>
            </div>
            <p className="dfl-tos">
              {up ? (
                <>
                  By continuing you agree to the{" "}
                  <Link href="/terms" style={{ textDecoration: "underline" }}>
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" style={{ textDecoration: "underline" }}>
                    Privacy Policy
                  </Link>
                  .
                </>
              ) : (
                "Your data is private to your account."
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthView />
    </Suspense>
  );
}
