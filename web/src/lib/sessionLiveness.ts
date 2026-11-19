// The open session's liveness truth table, with no React: the hook feeds it the polled
// runner and host signals, the session's row, whether its runner was ever seen online, and the clock.

/**
 * How long (seconds) after a session is created to treat it as
 * `starting` rather than unreachable while its runner tunnel hasn't
 * registered yet.
 *
 * Runner liveness is poll-driven (the real-time `session.runner_status`
 * push was removed upstream), so for up to one
 * `RunnerHealthProvider` poll interval (~10s) after a brand-new session
 * is created, the poll still reads `runner_online: false`/`undefined`
 * even though the runner is mid-cold-boot. Without a grace window the
 * open view would flash a reconnect/fork banner over a session that is
 * simply starting. Set generously above the poll interval (plus runner
 * cold-start headroom) so the banner only appears once a launch has
 * genuinely had time to register; the moment the poll reports
 * `runner_online: true` the state flips to `online` regardless, so this
 * is only an upper bound on the "Connecting…" window, not a fixed delay.
 */
export const STARTING_GRACE_S = 45;

/**
 * The open session's liveness, derived from the runner tunnel, the host
 * tunnel, host-binding, and the caller's ownership. Exactly one variant
 * is active at a time and each maps to a distinct affordance:
 *
 * - `online` — the runner tunnel is registered; normal chat.
 * - `starting` — a relaunch is in-flight: an asleep session that a
 *   just-sent turn is waking right now (runner down, host up, a turn in
 *   flight). Transient and expected — the open view shows a passive
 *   "Connecting…" indicator (terminal-first sessions show the pill's own
 *   spinner), the composer stays open, and there's nothing to act on.
 *   Distinct from `runner_asleep`, which is an idle session whose runner
 *   is down with no turn yet trying to wake it. (Runner liveness is
 *   poll-driven — the real-time `session.runner_status` push was removed
 *   upstream — so the *initial* cold launch of a brand-new session isn't
 *   specially flagged here; its terminal-pill spinner comes from
 *   `terminalPending` once the runner connects.)
 * - `runner_asleep` — runner down, host up, and no turn in flight. The
 *   host relaunches the runner on the next message, so the composer stays
 *   open. The open view renders no banner for this state — typing
 *   silently relaunches the runner (which then flips it to `starting`).
 * - `host_asleep` — the session is host-bound, the host tunnel is down, but
 *   the host is a resumable managed host: the server wakes the sandbox on the
 *   next message (the send-message relaunch path calls `resume_managed_host`).
 *   Treated like `runner_asleep` — the composer stays open, no reconnect
 *   banner, and typing wakes it. This is what makes the backend resume
 *   reachable from the web; without it a resumable host would dead-end on
 *   `host_offline` below. While a just-sent turn is waking it (`turnActive`),
 *   this upgrades to `starting` so the ~85s cold wake shows a "Connecting…"
 *   intermediate rather than a blank screen.
 * - `host_offline` — the session is host-bound and the host tunnel is down,
 *   and the host is NOT resumable from the web (an external/laptop host, or a
 *   managed provider without a stop/resume lifecycle). The owner must
 *   reconnect the host from that machine (`isOwner` true), and any viewer can
 *   fork to continue independently.
 * - `local_stranded` — not host-bound (no `host_id`) and the runner is
 *   down. There's no host to relaunch it; the user restarts from their
 *   own machine, and forking is the escape hatch.
 * - `unknown` — liveness hasn't been observed yet for this session (not
 *   polled, no stream row). Callers must NOT block on this — treat it as
 *   "assume online until proven otherwise" so a not-yet-resolved poll
 *   doesn't flash a reconnect banner over a live session.
 */
export type SessionLiveness =
  | { kind: "online" }
  | { kind: "starting" }
  | { kind: "runner_asleep" }
  | { kind: "host_asleep" }
  | { kind: "host_offline"; isOwner: boolean }
  | { kind: "local_stranded" }
  | { kind: "unknown" };

/**
 * Everything the truth table reads. `runnerOnline` and `hostOnline` are the polled
 * tunnels (`undefined` before the first poll; `hostOnline` is `null` with no host).
 */
export interface SessionLivenessSignals {
  runnerOnline: boolean | undefined;
  hostOnline: boolean | null | undefined;
  /** Whether this session's runner was seen online since it was opened here. */
  runnerEverOnline: boolean;
  hostId: string | null;
  hostResumable: boolean;
  /** Whether the viewer owns the session; read only for `host_offline`. */
  isOwner: boolean;
  /** Unix seconds; missing on older snapshots. */
  createdAt: number | null | undefined;
  imported: boolean;
  subAgent: boolean;
  turnActive: boolean;
  /** Epoch ms when this client last launched a runner outside the send path. */
  launchedAt: number | null | undefined;
  /** Epoch ms. */
  now: number;
}

/**
 * The open session's {@link SessionLiveness} from the split liveness
 * signals.
 *
 * The truth table (runner / host / host_id / turn → state), in
 * precedence order — the first matching row wins:
 *
 * | # | runner_online | host_online | host_id | turnActive | → state              |
 * |---|---------------|-------------|---------|------------|----------------------|
 * | 1 | true          | (any)       | (any)   | (any)      | online               |
 * | 2 | not-true      | (any)       | (any)   | (any)      | starting (fresh*)    |
 * | 3 | not-true      | false       | set+resumable | true  | starting (waking)    |
 * | 3'| not-true      | false       | set+resumable | false | host_asleep          |
 * | 3"| not-true      | false       | set, non-resum| (any) | host_offline {owner} |
 * | 4 | undefined     | (any)       | (any)   | (any)      | unknown (pre-poll)   |
 * | 5 | false         | true        | (any)   | true       | starting (relaunch)  |
 * | 5'| false         | true        | (any)   | false      | runner_asleep        |
 * | 6 | false         | undefined   | set     | (any)      | unknown (host unseen)|
 * | 7 | false         | null/false  | null    | (any)      | local_stranded       |
 *
 * `*fresh` = `created_at` is within {@link STARTING_GRACE_S} of now AND
 * the runner tunnel has never been observed online (initial cold boot).
 * Once a runner has come online, a later `runner_online: false` is a real
 * crash, not cold boot, so the grace no longer applies and rows 3/5–7 win.
 *
 * `runner_online === true` short-circuits to `online` — a registered
 * runner tunnel is the only signal that means "chat now." A just-created
 * session whose runner hasn't registered yet (row 2) is cold-booting, not
 * stranded: surface `starting` rather than a reconnect banner until the
 * grace window lapses. A confirmed host-down splits on resumability: a
 * resumable managed host is `host_asleep` (row 3 — wakeable by sending a
 * message, composer open), a non-resumable one is `host_offline` (row 3' —
 * reconnect / fork).
 * Pre-poll `undefined` (row 4) stays `unknown` so a not-yet-resolved poll
 * doesn't flash a banner over a live session. A known-down runner with a
 * live host then splits on whether a turn is in flight: a just-sent turn
 * means the host is relaunching the runner *now* → `starting` (row 5);
 * otherwise it's idle `runner_asleep` (row 5'). Runner liveness is
 * poll-driven (the real-time `session.runner_status` push was removed
 * upstream).
 */
export function sessionLiveness(signals: SessionLivenessSignals): SessionLiveness {
  const {
    runnerOnline,
    hostOnline,
    runnerEverOnline,
    hostId,
    hostResumable,
    isOwner,
    createdAt,
    imported,
    subAgent,
    turnActive,
    launchedAt,
    now,
  } = signals;

  // 1. A live runner tunnel is the only thing that means "chat normally".
  if (runnerOnline === true) return { kind: "online" };

  // 2. Startup grace: a freshly-created session whose runner tunnel hasn't
  // registered yet is cold-booting, not stranded. The runner-liveness poll
  // reads stale-`false`/`undefined` for up to one interval after creation
  // (see STARTING_GRACE_S), so surface `starting` — a passive "Connecting…"
  // intermediate with the composer open — instead of flashing a reconnect
  // banner. This precedes the host_offline check so a brand-new host-bound
  // session whose host hasn't registered yet doesn't flash "host offline"
  // either. `created_at` is Unix seconds; a missing/zero value (older
  // snapshot) yields a large delta and harmlessly skips the grace.
  if (
    !runnerEverOnline &&
    !imported &&
    typeof createdAt === "number" &&
    createdAt > 0 &&
    now / 1000 - createdAt < STARTING_GRACE_S
  ) {
    return { kind: "starting" };
  }

  // 2'. Same grace for a runner this client just asked a host to launch
  // outside the send path (a host switch). Deliberately NOT gated on
  // `runnerEverOnline`: the point of a switch is that the previous runner
  // WAS online and is now gone, so the session genuinely re-enters cold
  // boot. Epoch ms, unlike `created_at`.
  if (typeof launchedAt === "number" && now - launchedAt < STARTING_GRACE_S * 1000) {
    return { kind: "starting" };
  }

  // 3. A host-bound session whose host is confirmed offline. If the host is
  // a resumable managed host, the server wakes the sandbox on the next
  // message (the send-message relaunch path calls resume_managed_host). A
  // just-sent turn (turnActive) is waking it *now* — surface the same
  // `starting` "Connecting…" intermediate as a fresh launch so the ~85s cold
  // wake isn't a blank screen; idle (no turn) stays `host_asleep` (composer
  // open, no banner). Either way it's NOT the host_offline dead-end.
  // Otherwise (non-resumable) it's genuinely stuck: `host_offline`.
  if (hostId && hostOnline === false) {
    if (hostResumable) {
      return turnActive ? { kind: "starting" } : { kind: "host_asleep" };
    }
    return { kind: "host_offline", isOwner };
  }

  // 4. The runner has not been observed yet (pre-poll) — don't surface any
  // affordance over what may well be a live session.
  if (runnerOnline === undefined) return { kind: "unknown" };

  // Runner is known-offline from here down.

  // 5. Host is up: the host relaunches the runner on the next message. If
  // a turn is already in flight (the user just sent, or a cross-client
  // turn is running), that relaunch is happening *now* — surface the same
  // `starting` "Connecting…" intermediate as a fresh launch so there's no
  // silent gap. Otherwise the session is idle-asleep: the open view
  // renders nothing and the composer stays open, and the next send flips
  // it to `starting`.
  if (hostOnline === true) {
    return turnActive ? { kind: "starting" } : { kind: "runner_asleep" };
  }

  // 6. Host-bound but host liveness unseen (`host_id` set,
  // `host_online === undefined`): don't guess host-down — fall through to
  // `unknown` rather than asserting.
  if (hostId) return { kind: "unknown" };

  // 7a. Sub-agent with dead runner. Sub-agents have no host binding and
  // can't be relaunched from a CLI command — they recover via their
  // parent's live runner (server-side heal on message send). Keep the
  // composer open so the send reaches the server; never show the CLI
  // reconnect modal for these.
  if (subAgent) return { kind: "runner_asleep" };

  // 7. Not host-bound. `host_online` is `null` for these (no host to be
  // online); once the runner is known-down there's no host to relaunch
  // it, so the user restarts from their own machine.
  if (hostOnline === null || hostOnline === false) return { kind: "local_stranded" };
  // host_online undefined for a non-host-bound session shouldn't happen
  // (the stream sets it to null), but treat the unobserved case as
  // unknown rather than asserting.
  return { kind: "unknown" };
}
