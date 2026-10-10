"use client";

// ============================================================
// Dayflow AI — /auth/reset (new-password form)
// ------------------------------------------------------------
// The recovery email link lands on /auth/callback?next=/auth/reset
// with a fresh session (exchanged from the recovery code). This
// page sets the new password and drops the user back into the app.
// A user without a session never reaches here (middleware bounce).
// ============================================================

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DayflowLogo } from "@/components/brand/DayflowLogo";
import { SkySync } from "@/components/dayflow/SkySync";
import { haptic } from "@/lib/haptics";

function pwScore(p: string) {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) n++;
  if (/[^A-Za-z0-9]/.test(p)) n++;
  return Math.min(4, p ? Math.max(n, 1) : 0);
}
const PW_LABELS = ["", "Weak", "Okay", "Good", "Strong"];

export default function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  /* confirm the recovery session actually exists */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/auth");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const score = pwScore(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      haptic([10, 40, 10]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your password.");
      setPending(false);
    }
  }

  return (
    <main className="dfl">
      <SkySync />
      <div className="dfl-body">
        <div className="dfl-head">
          <Link className="dfl-back" href="/" aria-label="Back">
            ‹
          </Link>
          <DayflowLogo live className="dfl-lgs" />
          <span style={{ width: 44 }} />
        </div>

        {done ? (
          <div className="dfl-title">
            <h1>Password updated</h1>
            <p className="dfl-sub">Your day is right where you left it.</p>
          </div>
        ) : (
          <>
            <div className="dfl-title">
              <h1>Choose a new password</h1>
              <p className="dfl-sub">Eight characters or more — a phrase works great.</p>
            </div>

            <form id="dfl-reset" onSubmit={submit} noValidate>
              <div className="dfl-pw">
                <input
                  className="dfl-in"
                  type={showPw ? "text" : "password"}
                  placeholder="New password (8+ characters)"
                  autoComplete="new-password"
                  aria-label="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              <div className="dfl-meter" style={{ marginTop: 12 }} aria-hidden="true">
                <div className="dfl-mb">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={i < score ? `on l${score}` : ""} />
                  ))}
                </div>
                <span className="dfl-ml">{PW_LABELS[score]}</span>
              </div>

              <div className="dfl-err sh" role="alert" key={`err-${error}`}>
                {error}
              </div>
            </form>
          </>
        )}

        <div className="dfl-dock">
          <div className="dfl-dockc">
            {done ? (
              <button
                type="button"
                className="dfl-btn"
                onClick={() => {
                  router.replace("/");
                  router.refresh();
                }}
              >
                <span>Back to my day</span>
              </button>
            ) : (
              <button
                type="submit"
                form="dfl-reset"
                className={`dfl-btn${pending || checking ? " ld" : ""}`}
                disabled={pending || checking}
              >
                <span>{pending ? "Saving…" : "Save new password"}</span>
              </button>
            )}
            <p className="dfl-tos">Your data is private to your account.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
