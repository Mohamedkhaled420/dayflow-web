"use client";

// ============================================================
// Dayflow AI — Team Mode (Phase 3 / PRD §2 Team Mode)
// ------------------------------------------------------------
// One teammate, zero audience. This page is the whole Team Mode
// surface:
//   - Invite flow: create a team_invites row by email; the invitee
//     sees it addressed to them (RLS) and accepts via the
//     accept_team_invite RPC, which links the team (0007).
//   - Dashboard: teammate habit-completion STATUS ONLY (today /
//     week / streak — never habit names, never journal content),
//     presence (last_seen from the one presence row per user),
//     praise presets writing to team_activities.
//   - Presence pulse: a postgres_changes channel on team_activities
//     filtered to this team, authenticated with the USER JWT via
//     the shared browser client (RLS-respecting — never
//     service_role). Incoming events re-mount the teammate card so
//     the transform/opacity-only .df-pulse animation replays, plus
//     a .df-tick dot.
//
// Styling: ONLY tokens from src/styles/theme.css composed via the
// GlassPanel signature primitive (DESIGN.md contract). All targets
// are >=44pt (min-h-11/min-h-12); all inputs are 16px (text-base).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  Clock,
  Coffee,
  Flame,
  Heart,
  UserPlus,
  Users,
} from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  syncClient,
  useDayflowStore,
  type TeamActivityRow,
} from "@/store/useDayflowStore";

// ---------- payload helpers ----------

type TeamPayload = {
  message?: string;
  last_seen?: string;
  displayName?: string;
  email?: string | null;
  status?: string;
};

function payloadOf(row: TeamActivityRow): TeamPayload {
  return row.payload && typeof row.payload === "object"
    ? (row.payload as TeamPayload)
    : {};
}

// ---------- time helpers ----------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- habit status (STATUS ONLY — never names/notes) ----------

function habitCounts(rows: TeamActivityRow[], userId: string) {
  const today = dayKey(new Date());
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const habitRows = rows.filter(
    (r) =>
      r.user_id === userId &&
      r.activity_type === "habit" &&
      new Date(r.timestamp).getTime() >= weekAgo
  );
  const todayCount = habitRows.filter(
    (r) => dayKey(new Date(r.timestamp)) === today
  ).length;
  return { todayCount, weekCount: habitRows.length };
}

function habitStreak(rows: TeamActivityRow[], userId: string): number {
  const days = new Set(
    rows
      .filter((r) => r.user_id === userId && r.activity_type === "habit")
      .map((r) => dayKey(new Date(r.timestamp)))
  );
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    // A streak survives "not yet today" — it ends after a full missed day.
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------- constants ----------

const PRAISE_PRESETS = [
  { message: "Keep pushing!", icon: Flame },
  { message: "Rest day?", icon: Coffee },
] as const;

// ---------- page ----------

export default function TeamPage() {
  const team = useDayflowStore((s) => s.team);
  const teamActivities = useDayflowStore((s) => s.teamActivities);
  const incomingInvites = useDayflowStore((s) => s.incomingInvites);
  const sentInvites = useDayflowStore((s) => s.sentInvites);
  const teamLoaded = useDayflowStore((s) => s.teamLoaded);
  const loadTeam = useDayflowStore((s) => s.loadTeam);
  const createTeamInvite = useDayflowStore((s) => s.createTeamInvite);
  const acceptTeamInvite = useDayflowStore((s) => s.acceptTeamInvite);
  const sendTeamPraise = useDayflowStore((s) => s.sendTeamPraise);
  const pulseTeamPresence = useDayflowStore((s) => s.pulseTeamPresence);

  const [myId, setMyId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [praiseSent, setPraiseSent] = useState<string | null>(null);
  /** Bumped on every incoming teammate event — replays .df-pulse/.df-tick. */
  const [pulseKey, setPulseKey] = useState(0);
  const [live, setLive] = useState(false);
  const praiseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- load + identity ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = await syncClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;
      setMyId(user?.id ?? null);
      await loadTeam();
    })();
    return () => {
      alive = false;
    };
  }, [loadTeam]);

  // ---------- realtime channel (USER JWT — RLS-respecting) ----------
  const teamId = team?.id ?? null;
  useEffect(() => {
    if (!teamId || !myId) return;
    let disposed = false;
    let channel: RealtimeChannel | null = null;

    const onEvent = (payload: { new: TeamActivityRow }) => {
      const row = payload.new;
      if (!row?.id) return;
      // Merge into the in-memory feed (id-deduped; presence upserts
      // UPDATE the same row).
      useDayflowStore.setState((s) => {
        if (s.teamActivities.some((a) => a.id === row.id)) {
          return {
            teamActivities: s.teamActivities.map((a) => (a.id === row.id ? row : a)),
          };
        }
        return { teamActivities: [row, ...s.teamActivities].slice(0, 80) };
      });
      // Pulse only for the TEAMMATE's events — our own writes already
      // render optimistically.
      if (row.user_id !== myId) {
        setPulseKey((k) => k + 1);
      }
    };

    void (async () => {
      // syncClient is async (Phase 4 bundle diet): the shared client
      // arrives as a cached promise; everything below is unchanged.
      const supabase = await syncClient();
      if (disposed) return;

      // Explicit realtime auth: the cookie-restored session can race the
      // socket connect, and a token-less postgres_changes join authorizes
      // nothing server-side (channel still reports SUBSCRIBED). AWAITING
      // setAuth pins the USER JWT before the join payload is built —
      // RLS-respecting, never service_role.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (disposed) return;

      channel = supabase.channel(`team-${teamId}`);
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "team_activities",
            filter: `team_id=eq.${teamId}`,
          },
          onEvent
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "team_activities",
            filter: `team_id=eq.${teamId}`,
          },
          onEvent
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();

    return () => {
      disposed = true;
      setLive(false);
      // The client promise is a cached singleton — resolving it in the
      // cleanup always yields the same instance that owns the channel.
      void syncClient().then((supabase) => {
        if (channel) void supabase.removeChannel(channel);
      });
    };
  }, [teamId, myId]);

  // ---------- presence heartbeat (on arrival + every 60s) ----------
  useEffect(() => {
    if (!teamId) return;
    void pulseTeamPresence();
    const id = setInterval(() => void pulseTeamPresence(), 60_000);
    return () => clearInterval(id);
  }, [teamId, pulseTeamPresence]);

  useEffect(
    () => () => {
      if (praiseTimer.current) clearTimeout(praiseTimer.current);
    },
    []
  );

  // ---------- derived (dashboard) ----------

  const teammateId = useMemo(() => {
    if (!team || !myId) return null;
    return team.member_a === myId ? team.member_b : team.member_a;
  }, [team, myId]);

  /** Identity arrives via the other member's 'join' broadcast (0007 flow):
   *  profiles are owner-only under RLS, so the join payload is the only
   *  name/email channel — journal content never enters this table. */
  const teammateIdentity = useMemo(() => {
    if (!teammateId) return null;
    const joinRow = teamActivities.find(
      (r) => r.user_id === teammateId && r.activity_type === "join"
    );
    const p = joinRow ? payloadOf(joinRow) : {};
    if (p.displayName || p.email) {
      return { name: p.displayName ?? "Teammate", email: p.email ?? null };
    }
    return null;
  }, [teammateId, teamActivities]);

  const teammateFallbackEmail = useMemo(() => {
    // The INVITER always knows the address they invited.
    if (!teammateId || !myId) return null;
    if (team?.member_a !== myId) return null; // I was the invitee
    return sentInvites.find((i) => i.status === "pending")?.invitee_email ?? null;
  }, [teammateId, myId, team, sentInvites]);

  const teammateName =
    teammateIdentity?.name ??
    (teammateFallbackEmail ? teammateFallbackEmail.split("@")[0] : "Teammate");
  const teammateEmail = teammateIdentity?.email ?? teammateFallbackEmail;

  const teammatePresence = useMemo(() => {
    if (!teammateId) return null;
    const rows = teamActivities.filter(
      (r) => r.user_id === teammateId && r.activity_type === "presence"
    );
    if (rows.length === 0) return null;
    const lastSeen = payloadOf(rows[0]).last_seen;
    return lastSeen ? relTime(lastSeen) : null;
  }, [teammateId, teamActivities]);

  const teammateHabits = useMemo(
    () => ({
      ...habitCounts(teamActivities, teammateId ?? ""),
      streak: habitStreak(teamActivities, teammateId ?? ""),
    }),
    [teamActivities, teammateId]
  );
  const myHabits = useMemo(
    () => ({
      ...habitCounts(teamActivities, myId ?? ""),
      streak: habitStreak(teamActivities, myId ?? ""),
    }),
    [teamActivities, myId]
  );

  const feed = useMemo(() => teamActivities.slice(0, 8), [teamActivities]);

  // ---------- actions ----------

  async function submitInvite() {
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteError("");
    const ok = await createTeamInvite(inviteEmail);
    if (!ok) {
      setInviteError(
        "That didn't look like a valid email — or the invite couldn't be sent."
      );
    } else {
      setInviteEmail("");
    }
    setInviteBusy(false);
  }

  async function acceptIncoming() {
    if (accepting || incomingInvites.length === 0) return;
    setAccepting(true);
    await acceptTeamInvite(incomingInvites[0].id);
    setAccepting(false);
  }

  function praise(message: string) {
    void sendTeamPraise(message).then(() => {
      setPraiseSent(message);
      if (praiseTimer.current) clearTimeout(praiseTimer.current);
      praiseTimer.current = setTimeout(() => setPraiseSent(null), 2400);
    });
  }

  // ---------- render ----------

  const showInviteCard = teamLoaded && !team && incomingInvites.length > 0;
  const showEmpty = teamLoaded && !team && incomingInvites.length === 0;
  const showDashboard = teamLoaded && !!team;

  return (
    <main className="df-window flex min-h-screen items-center justify-center p-4 font-sans">
      <div className="df-rise w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-(--df-text-secondary) transition-opacity duration-(--duration-press) hover:opacity-80"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <LogoMark size={20} className="-my-1.5" />
          Dayflow
        </Link>

        {/* ---------- incoming invite ---------- */}
        {showInviteCard && (
          <GlassPanel
          hairline="none"
          className="p-6 sm:p-8"
          style={{
            background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
            border: "0.5px solid var(--df-panel-border)",
            borderRadius: "var(--df-radius-panel)",
            boxShadow: "var(--df-hero-panel-shadow)",
          }}
        >
            <p className="text-xs font-semibold tracking-[0.22em] text-(--df-accent-text)">
              TEAM MODE
            </p>
            <h1 className="mt-4 text-2xl font-semibold text-(--df-text-primary)">
              You&apos;ve got a teammate request
            </h1>
            <p className="mt-1 text-sm text-(--df-text-secondary)">
              Someone thinks you&apos;ll actually show up. Teams in Dayflow
              are pairs — one teammate, zero audience.
            </p>
            <button
              type="button"
              onClick={acceptIncoming}
              disabled={accepting}
              className="mt-6 df-press df-btn-primary min-h-12 w-full px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {accepting ? "Linking your team…" : "Accept invite"}
            </button>
          </GlassPanel>
        )}

        {/* ---------- empty state ---------- */}
        {showEmpty && (
          <GlassPanel
          hairline="none"
          className="p-6 sm:p-8"
          style={{
            background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
            border: "0.5px solid var(--df-panel-border)",
            borderRadius: "var(--df-radius-panel)",
            boxShadow: "var(--df-hero-panel-shadow)",
          }}
        >
            <p className="text-xs font-semibold tracking-[0.22em] text-(--df-accent-text)">
              TEAM MODE
            </p>
            <h1 className="mt-4 text-2xl font-semibold text-(--df-text-primary)">
              No teammate yet
            </h1>
            <p className="mt-1 text-sm text-(--df-text-secondary)">
              Dayflow teams are pairs. Share habit status, streaks, and a
              little thunder — never your journal. Invite someone who&apos;ll
              actually show up.
            </p>

            <label className="mt-6 flex flex-col gap-2">
              <span className="text-sm font-medium text-(--df-text-secondary)">
                Their email
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitInvite();
                }}
                placeholder="teammate@example.com"
                autoComplete="email"
                inputMode="email"
                className="df-input-glass min-h-12 px-4 text-base text-(--df-text-primary) outline-none transition-colors placeholder:text-(--df-text-muted)"
              />
            </label>
            <button
              type="button"
              onClick={() => void submitInvite()}
              disabled={inviteBusy}
              className="df-press df-btn-primary mt-3 flex min-h-12 w-full items-center justify-center gap-2 px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="size-4" aria-hidden />
              {inviteBusy ? "Sending…" : "Invite a teammate"}
            </button>

            {inviteError ? (
              <p role="alert" className="mt-3 text-sm text-(--df-destructive-text)">
                {inviteError}
              </p>
            ) : null}

            {sentInvites.length > 0 && (
              <ul className="mt-5 flex flex-col gap-2">
                {sentInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="df-chip flex min-h-11 items-center gap-2 rounded-[16px] px-4 text-sm text-(--df-text-secondary)"
                  >
                    <Clock className="size-4 shrink-0 text-(--df-accent-text)" aria-hidden />
                    <span>
                      Waiting on{" "}
                      <span className="font-medium text-(--df-text-primary)">
                        {invite.invitee_email}
                      </span>
                    </span>
                    <span className="ml-auto rounded-full border border-(--df-chip-border) px-2 py-0.5 text-xs text-(--df-text-muted)">
                      pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        )}

        {/* ---------- dashboard ---------- */}
        {showDashboard && teammateId && (
          <div className="flex flex-col gap-4">
            {/* teammate card — the pulse target */}
            <GlassPanel
          hairline="none"
          className="relative p-6"
          style={{
            background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
            border: "0.5px solid var(--df-panel-border)",
            borderRadius: "var(--df-radius-panel)",
            boxShadow: "var(--df-hero-panel-shadow)",
          }}
        >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-[0.22em] text-(--df-accent-text)">
                  YOUR TEAM
                </p>
                <span
                  className="flex items-center gap-1.5 text-xs text-(--df-text-secondary)"
                  aria-label={live ? "Live connection active" : "Connecting"}
                >
                  <span
                    className="size-2 rounded-(--radius-pill)"
                    style={{
                      background: live
                        ? "var(--df-sync-ok)"
                        : "var(--df-text-muted)",
                    }}
                    aria-hidden
                  />
                  {live ? "live" : "connecting"}
                </span>
              </div>

              <div key={pulseKey} className="df-pulse mt-4 flex items-center gap-4">
                <span
                  className="flex size-14 shrink-0 items-center justify-center rounded-full border border-(--df-chip-border) bg-(--df-secondary) text-xl font-extrabold text-(--df-text-primary)"
                  aria-hidden
                >
                  {teammateName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-(--df-text-primary)">
                    {teammateName}
                  </p>
                  <p className="truncate text-sm text-(--df-text-secondary)">
                    {teammateEmail ?? "Teammate"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-(--df-text-muted)">
                    <Clock className="size-3.5" aria-hidden />
                    {teammatePresence ? `last seen ${teammatePresence}` : "no presence yet"}
                  </p>
                </div>
                {/* visual tick — replays with the pulse */}
                <span
                  key={`tick-${pulseKey}`}
                  className="df-tick ml-auto size-2.5 shrink-0 rounded-(--radius-pill)"
                  style={{ background: "var(--df-accent)" }}
                  aria-hidden
                />
              </div>

              {/* STATUS ONLY: counts + streaks — never habit names */}
              <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Teammate habit status">
                <StatusChip label="today" value={`${teammateHabits.todayCount}`} />
                <StatusChip label="this week" value={`${teammateHabits.weekCount}`} />
                <StatusChip label="streak" value={`${teammateHabits.streak}d`} />
              </div>
            </GlassPanel>

            {/* praise presets */}
            <GlassPanel
          hairline="none"
          className="p-5"
          style={{
            background: "var(--df-summary-card-fill)",
            border: "0.5px solid var(--df-summary-card-border)",
            borderRadius: "var(--df-radius-panel)",
          }}
        >
              <p className="text-sm font-medium text-(--df-text-secondary)">
                Send a little thunder
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {PRAISE_PRESETS.map(({ message, icon: Icon }) => (
                  <button
                    key={message}
                    type="button"
                    onClick={() => praise(message)}
                    aria-label={`Send praise to ${teammateName}: ${message}`}
                    className="df-press df-chip flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-(--df-text-primary)"
                  >
                    <Icon className="size-4 text-(--df-streak)" aria-hidden />
                    {praiseSent === message ? (
                      <span className="flex items-center gap-1.5">
                        <Check className="size-4 text-(--df-sync-ok)" aria-hidden />
                        Sent
                      </span>
                    ) : (
                      message
                    )}
                  </button>
                ))}
              </div>
            </GlassPanel>

            {/* my status */}
            <GlassPanel
          hairline="none"
          className="flex items-center gap-4 p-5"
          style={{
            background: "var(--df-summary-card-fill)",
            border: "0.5px solid var(--df-summary-card-border)",
            borderRadius: "var(--df-radius-panel)",
          }}
        >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-(--df-chip-border) bg-(--df-chip-fill) text-sm font-bold text-(--df-text-secondary)"
                aria-hidden
              >
                You
              </span>
              <p className="text-sm text-(--df-text-secondary)">
                <span className="font-medium text-(--df-text-primary)">
                  {myHabits.todayCount} today
                </span>{" "}
                · {myHabits.weekCount} this week · {myHabits.streak}d streak
              </p>
            </GlassPanel>

            {/* activity feed — status-only events */}
            <GlassPanel
              hairline="none"
              className="p-5"
              edgeFade
              style={{
                background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
                border: "0.5px solid var(--df-panel-border)",
                borderRadius: "var(--df-radius-panel)",
                boxShadow: "var(--df-hero-panel-shadow)",
              }}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-(--df-text-secondary)">
                <Users className="size-4" aria-hidden />
                Team activity
              </p>
              <ul
                className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
                aria-live="polite"
              >
                {feed.length === 0 && (
                  <li className="text-sm text-(--df-text-muted)">
                    Quiet in here. Complete a habit or send some praise.
                  </li>
                )}
                {feed.map((row) => (
                  <li
                    key={row.id}
                    className="flex min-h-11 items-center gap-2.5 text-sm text-(--df-text-secondary)"
                  >
                    <FeedIcon type={row.activity_type} self={row.user_id === myId} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-(--df-text-primary)">
                        {row.user_id === myId ? "You" : teammateName}
                      </span>{" "}
                      {feedText(row)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-(--df-text-muted)">
                      {clockTime(row.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </div>
        )}

        {/* ---------- loading ---------- */}
        {!teamLoaded && (
          <GlassPanel
          hairline="none"
          className="p-6 sm:p-8"
          style={{
            background: "color-mix(in srgb, var(--df-panel-fill) 90%, transparent)",
            border: "0.5px solid var(--df-panel-border)",
            borderRadius: "var(--df-radius-panel)",
            boxShadow: "var(--df-hero-panel-shadow)",
          }}
        >
            <p className="text-xs font-semibold tracking-[0.22em] text-(--df-accent-text)">
              TEAM MODE
            </p>
            <p className="mt-4 animate-pulse text-sm text-(--df-text-secondary)">
              Checking for your team…
            </p>
          </GlassPanel>
        )}
      </div>
    </main>
  );
}

// ---------- small pieces ----------

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="df-chip flex min-h-11 flex-col items-center justify-center rounded-[16px] px-2 py-1.5">
      <span className="text-base font-semibold tabular-nums text-(--df-text-primary)">{value}</span>
      <span className="text-xs text-(--df-text-muted)">{label}</span>
    </div>
  );
}

function FeedIcon({ type, self }: { type: string; self: boolean }) {
  if (type === "praise") {
    return <Heart className="size-4 shrink-0 text-(--df-streak)" aria-hidden />;
  }
  if (type === "join") {
    return <Users className="size-4 shrink-0 text-(--df-accent)" aria-hidden />;
  }
  if (type === "presence") {
    return <Clock className="size-4 shrink-0 text-(--df-text-muted)" aria-hidden />;
  }
  return self ? (
    <Check className="size-4 shrink-0 text-(--df-sync-ok)" aria-hidden />
  ) : (
    <Flame className="size-4 shrink-0 text-(--df-accent-text)" aria-hidden />
  );
}

function feedText(row: TeamActivityRow): string {
  switch (row.activity_type) {
    case "habit":
      return "locked in a habit";
    case "praise":
      return `sent praise — “${payloadOf(row).message ?? "nice work"}”`;
    case "join":
      return "joined the team";
    case "presence":
      return "was here";
    default:
      return row.activity_type;
  }
}
