"use client";

// ============================================================
// Dayflow AI — the landing page (reference mockup "Dayflow (6)"
// landHTML, ported 1:1)
// ------------------------------------------------------------
// Structure: sticky top bar → hero (live logo, greeting chip,
// headline, CTA, scroll cue) → the pinned STORY runway (340svh:
// scroll draws the logo in, cycles three numbered story cards,
// label swaps Dayflow → Your rhythm → Your day → Your voice) →
// feature cards → privacy pills → FAQ accordion → final CTA →
// footer. A dock slides up after half a viewport of scroll.
//
// The scroll engine is the reference's lScroll/lStep: lerped
// --hp (hero progress) + --sp (story progress) with per-card
// transform math, driven by one rAF loop that stops itself.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DayflowLogo } from "@/components/brand/DayflowLogo";
import { SkySync } from "@/components/dayflow/SkySync";
import { haptic } from "@/lib/haptics";

/* ---------------- content (reference copy) ---------------- */

const STORY_LABELS = ["Your rhythm", "Your day", "Your voice"];

const STORY = [
  {
    c: "var(--df-p-blue)",
    t: "Tell us your rhythm",
    d: "Wake time, goals and what you are building. Takes a minute.",
    scene: (
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <path d="M10 58A50 50 0 0 1 110 58" stroke="var(--dfl-dip)" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path
          className="dfl-ps"
          pathLength={100}
          d="M10 58A50 50 0 0 1 110 58"
          stroke="var(--df-p-blue)"
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="40 100"
          strokeDashoffset="-20"
        />
        <circle r="6" fill="var(--color-accent-recovery)">
          <animateMotion dur="5s" repeatCount="indefinite" path="M10 58A50 50 0 0 1 110 58" />
        </circle>
      </svg>
    ),
  },
  {
    c: "var(--df-p-rose)",
    t: "Your day takes shape",
    d: "Deep work lands where your energy peaks. Meals and training fit around it.",
    scene: (
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <rect className="dfl-bs b1" x="8" y="8" width="64" height="12" rx="6" fill="var(--df-p-blue)" />
        <rect className="dfl-bs b2" x="30" y="26" width="76" height="12" rx="6" fill="var(--df-p-rose)" />
        <rect className="dfl-bs b3" x="14" y="44" width="52" height="12" rx="6" fill="var(--df-p-mauve)" />
      </svg>
    ),
  },
  {
    c: "var(--df-p-mauve)",
    t: "Talk it through",
    d: "Say what is on your mind. Dia answers out loud and logs only when you tap.",
    scene: (
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <g className="dfl-wvg">
          <path
            d="M-80 32q10-18 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"
            stroke="var(--df-p-mauve)"
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g className="dfl-wvg b">
          <path
            d="M-80 32q10 12 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"
            stroke="var(--df-p-blue)"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
    ),
  },
] as const;

const FEATURES = [
  {
    key: "goal",
    k: "var(--df-p-blue)",
    t: "Shape your day",
    d: "Drag through a living timeline. Deep work lands at your high-energy hours.",
    paths: (
      <>
        <path className="b" d="M2.5 20L9 8.5l4.5 7 2.5-3.5L21.5 20z" />
        <path className="s" d="M9 8.5V3.5" />
        <path className="a" d="M9 3.5l5 1.7-5 1.7z" />
      </>
    ),
  },
  {
    key: "rise",
    k: "var(--df-p-powder)",
    t: "Keep the streak",
    d: "Habits that forgive a missed day and celebrate the long run.",
    paths: (
      <>
        <path className="b" d="M5 17a7 7 0 0 1 14 0z" />
        <path className="s" d="M12 4.5V7M4.8 9l1.8 1.5M19.2 9l-1.8 1.5M3 20h18" />
      </>
    ),
  },
  {
    key: "team",
    k: "var(--df-p-mauve)",
    t: "Talk to Dia",
    d: "A private voice companion. Nothing is logged until you tap.",
    paths: (
      <>
        <circle className="b" cx="9" cy="10" r="5.2" />
        <circle className="a" cx="15" cy="13.5" r="5.2" fillOpacity=".85" />
      </>
    ),
  },
] as const;

const PRIVACY = ["Your journal stays yours", "Nothing logs until you tap", "Delete anytime"];

const FAQ = [
  ["Do I need a card to start?", "No. Create an account with your email and try it. Nothing to pay up front."],
  ["Where does my data live?", "Synced to your account only. Your journal and coach chats are private, and never shared."],
  ["Can I look around first?", "Yes. Tap Try it first and explore Today, Nutrition, Training, Habits and your coach."],
] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night · plan a gentler tomorrow";
  if (h < 12) return "Good morning · shape your day";
  if (h < 18) return "Good afternoon · reset your day";
  return "Good evening · shape tomorrow";
}

/* ---------------- component ---------------- */

export function LandingView() {
  const rootRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const sklgRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const dotsRef = useRef<(HTMLLIElement | null)[]>([]);
  const labelRef = useRef<HTMLSpanElement>(null);

  const [dockShown, setDockShown] = useState(false);
  const [barSolid, setBarSolid] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const router = useRouter();

  /* "Try it first" — anonymous Supabase session, straight into
     the app (no detour through /auth). The supabase-js chunk is
     dynamically imported so the landing payload stays lean. */
  const enterAsGuest = useCallback(async () => {
    if (guestBusy) return;
    setGuestBusy(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      haptic([10, 40, 10]);
      router.replace("/");
      router.refresh();
    } catch {
      setGuestBusy(false);
      router.push("/auth");
    }
  }, [guestBusy, router]);

  /* the scroll engine — reference lScroll/lStep, window-scrolled */
  useEffect(() => {
    const root = rootRef.current;
    const story = storyRef.current;
    if (!root || !story) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const ss = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a));
      return t * t * (3 - 2 * t);
    };

    let raf = 0;
    let lsp = 0; // story progress (lerped)
    let lspT = 0; // target
    let lhp = 0; // hero progress (lerped)
    let lhpT = 0;

    const measure = () => {
      const st = window.scrollY;
      const vh = window.innerHeight || 1;
      const hero = root.querySelector<HTMLElement>(".dfl-hero");
      lhpT = clamp(st / (((hero?.offsetHeight) || vh) * 0.75));
      const r = story.getBoundingClientRect();
      lspT = clamp(-r.top / Math.max(1, r.height - vh));
      setBarSolid(st > 24);
      setDockShown(st > vh * 0.5);
    };

    const step = () => {
      raf = 0;
      lsp += (lspT - lsp) * 0.16;
      lhp += (lhpT - lhp) * 0.22;
      if (Math.abs(lspT - lsp) < 0.0005) lsp = lspT;
      if (Math.abs(lhpT - lhp) < 0.0005) lhp = lhpT;

      root.style.setProperty("--hp", lhp.toFixed(4));
      story.style.setProperty("--sp", lsp.toFixed(4));

      const lg = sklgRef.current;
      if (lg) {
        const c = (x: number) => (100 - 100 * clamp(x)).toFixed(2);
        lg.style.setProperty("--d1", c(lsp / 0.4));
        lg.style.setProperty("--d2", c((lsp - 0.25) / 0.4));
        lg.style.setProperty("--d3", c((lsp - 0.5) / 0.4));
        lg.style.setProperty("--dh", c((lsp - 0.84) / 0.1));
        lg.style.setProperty("--dt", clamp((lsp - 0.92) / 0.08).toFixed(3));
      }

      const u = lsp * 2;
      cardsRef.current.forEach((el, i) => {
        if (!el) return;
        const d = u - i;
        const ad = Math.abs(d);
        const op = ss(0.7, 0.3, ad);
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translateY(${(-d * 58).toFixed(1)}px) scale(${(1 - ad * 0.07).toFixed(3)})`;
        el.style.pointerEvents = op > 0.6 ? "auto" : "none";
      });

      const act = Math.min(2, Math.round(u));
      dotsRef.current.forEach((el, i) => el?.classList.toggle("on", i === act));
      const lb = labelRef.current;
      const next = lsp > 0.01 ? STORY_LABELS[act] : "Dayflow";
      if (lb && lb.textContent !== next) lb.textContent = next;

      if (lsp !== lspT || lhp !== lhpT) raf = requestAnimationFrame(step);
    };

    const onScroll = () => {
      measure();
      if (!reduced && !raf) raf = requestAnimationFrame(step);
      else if (reduced) step();
    };

    measure();
    if (reduced) step();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* reveal-on-scroll (reference rvInit) */
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".dfl-rv"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const toggleFaq = useCallback((i: number) => {
    haptic(4);
    setOpenFaq((cur) => (cur === i ? null : i));
  }, []);

  return (
    <main className="dfw dfl-land" ref={rootRef}>
      <SkySync />
      {/* sticky top bar — frosts after 24px */}
      <div className={`dfl-bar${barSolid ? " sc2" : ""}`}>
        <div className="dfl-barc">
          <DayflowLogo live className="dfl-lgm" />
          <b>Dayflow</b>
          <Link className="dfl-signin" href="/auth?mode=in">
            Sign in
          </Link>
        </div>
      </div>

      <div className="dfl-body">
        {/* ------- hero ------- */}
        <section className="dfl-hero">
          <DayflowLogo live className="dfl-lgh" />
          <span className="dfl-hi">
            <i className="dfl-pd" />
            {greeting()}
          </span>
          <h1>
            Your day,
            <br />
            in <em>flow.</em>
          </h1>
          <p className="dfl-lead">
            Dayflow shapes your day around your energy, keeps your habits kind, and gives you a
            voice companion who actually knows you.
          </p>
          <div className="dfl-cta">
            <Link className="dfl-btn" href="/auth?mode=up">
              Shape my day
            </Link>
            <p className="dfl-mic">60 seconds · No card needed · Private by design</p>
          </div>
          <div className="dfl-scue" aria-hidden="true">
            <i />
            <span>Scroll</span>
          </div>
        </section>

        {/* ------- story: the pinned scroll runway ------- */}
        <section className="dfl-story" ref={storyRef}>
          <div className="dfl-pin">
            <div className="dfl-lgwrap">
              <DayflowLogo sta className="dfl-lgk ghost" />
              <div ref={sklgRef}>
                <DayflowLogo sta className="dfl-lgk" />
              </div>
            </div>
            <span className="dfl-skl" ref={labelRef}>
              Dayflow
            </span>
            <div className="dfl-deck">
              {STORY.map((s, i) => (
                <div
                  key={s.t}
                  className="dfl-sc3"
                  style={{ "--c": s.c } as React.CSSProperties}
                  ref={(el) => {
                    cardsRef.current[i] = el;
                  }}
                >
                  <span className="dfl-sn2">{i + 1}</span>
                  <b>{s.t}</b>
                  <p>{s.d}</p>
                  <div className="dfl-sv">{s.scene}</div>
                </div>
              ))}
            </div>
            <ul className="dfl-dots" aria-hidden="true" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  ref={(el) => {
                    dotsRef.current[i] = el;
                  }}
                />
              ))}
            </ul>
          </div>
        </section>

        {/* ------- features ------- */}
        <h2 className="dfl-h2 dfl-rv">Everything in one calm place</h2>
        {FEATURES.map((f, i) => (
          <div
            key={f.key}
            className="dfl-ft dfl-rv"
            style={{ "--d": `${i * 90}ms`, "--k": f.k } as React.CSSProperties}
          >
            <span className="dfl-ic2">
              <svg viewBox="0 0 24 24">{f.paths}</svg>
            </span>
            <div>
              <b>{f.t}</b>
              <p>{f.d}</p>
            </div>
          </div>
        ))}

        {/* ------- privacy pills ------- */}
        <div className="dfl-pv dfl-rv">
          {PRIVACY.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>

        {/* ------- FAQ ------- */}
        <h2 className="dfl-h2 dfl-rv">Good to know</h2>
        <div className="dfl-fqs dfl-rv">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`dfl-fq${openFaq === i ? " open" : ""}`}>
              <button type="button" onClick={() => toggleFaq(i)} aria-expanded={openFaq === i}>
                <span>{q}</span>
                <svg viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="dfl-fa">
                <div>
                  <p>{a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ------- final CTA ------- */}
        <div className="dfl-fin dfl-rv">
          <DayflowLogo live className="dfl-lgf" />
          <h2>Ready to feel your day flow?</h2>
          <p className="dfl-sub">Set up in about a minute.</p>
          <Link className="dfl-btn" href="/auth?mode=up">
            Create my account
          </Link>
        </div>

        <p className="dfl-fn">Dayflow · Private by design</p>
      </div>

      {/* ------- the landing dock (slides up after half a viewport) ------- */}
      <div className={`dfl-dock lnd${dockShown ? " show" : ""}`}>
        <div className="dfl-dockc">
          <Link className="dfl-btn" href="/auth?mode=up">
            Shape my day
          </Link>
          <div className="dfl-dock2">
            <Link href="/auth?mode=in">I have an account</Link>
            <i />
            <button type="button" onClick={() => void enterAsGuest()} disabled={guestBusy}>
              {guestBusy ? "Setting you up…" : "Try it first"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
