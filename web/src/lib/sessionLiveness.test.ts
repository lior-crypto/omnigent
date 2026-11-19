import { describe, expect, it } from "vitest";

import {
  STARTING_GRACE_S,
  sessionLiveness,
  type SessionLiveness,
  type SessionLivenessSignals,
} from "./sessionLiveness";

const NOW = 1_800_000_000_000;
// Created long ago, so the startup grace applies only where a case asks for it.
const OLD = NOW / 1000 - 10 * STARTING_GRACE_S;

function signals(overrides: Partial<SessionLivenessSignals>): SessionLivenessSignals {
  return {
    runnerOnline: false,
    hostOnline: true,
    runnerEverOnline: false,
    hostId: null,
    hostResumable: false,
    isOwner: true,
    createdAt: OLD,
    imported: false,
    subAgent: false,
    turnActive: false,
    launchedAt: null,
    now: NOW,
    ...overrides,
  };
}

const kind = (overrides: Partial<SessionLivenessSignals>) => sessionLiveness(signals(overrides));

describe("sessionLiveness truth table", () => {
  const rows: [string, Partial<SessionLivenessSignals>, SessionLiveness][] = [
    [
      "a registered runner is online, whatever else says",
      { runnerOnline: true, hostOnline: false, hostId: "h" },
      { kind: "online" },
    ],
    [
      "a fresh session cold-boots",
      { runnerOnline: undefined, createdAt: NOW / 1000 - 1 },
      { kind: "starting" },
    ],
    [
      "a fresh session cold-boots ahead of an unseen host",
      { hostId: "h", hostOnline: false, createdAt: NOW / 1000 - 1 },
      { kind: "starting" },
    ],
    [
      "a host switch's launch restarts the grace",
      { runnerEverOnline: true, launchedAt: NOW - 1_000 },
      { kind: "starting" },
    ],
    [
      "a resumable host down with a turn sent is waking",
      { hostId: "h", hostOnline: false, hostResumable: true, turnActive: true },
      { kind: "starting" },
    ],
    [
      "a resumable host down and idle is asleep",
      { hostId: "h", hostOnline: false, hostResumable: true },
      { kind: "host_asleep" },
    ],
    [
      "another host down is offline, for its owner",
      { hostId: "h", hostOnline: false },
      { kind: "host_offline", isOwner: true },
    ],
    [
      "another host down is offline, for a viewer",
      { hostId: "h", hostOnline: false, isOwner: false },
      { kind: "host_offline", isOwner: false },
    ],
    ["an unpolled runner is unknown", { runnerOnline: undefined }, { kind: "unknown" }],
    [
      "a down runner on a live host with a turn sent is relaunching",
      { turnActive: true },
      { kind: "starting" },
    ],
    ["a down runner on a live host is asleep", {}, { kind: "runner_asleep" }],
    ["a host not seen yet is unknown", { hostId: "h", hostOnline: undefined }, { kind: "unknown" }],
    [
      "a sub-agent recovers through its parent",
      { hostOnline: null, subAgent: true },
      { kind: "runner_asleep" },
    ],
    ["a session with no host is stranded", { hostOnline: null }, { kind: "local_stranded" }],
    [
      "a session with no host whose host reads down is stranded",
      { hostOnline: false },
      { kind: "local_stranded" },
    ],
    [
      "a session with no host and no host reading is unknown",
      { hostOnline: undefined },
      { kind: "unknown" },
    ],
  ];
  it.each(rows)("%s", (_name, overrides, expected) => {
    expect(kind(overrides)).toEqual(expected);
  });
});

describe("sessionLiveness startup grace", () => {
  it("ends at STARTING_GRACE_S after creation", () => {
    expect(kind({ createdAt: NOW / 1000 - STARTING_GRACE_S + 1 }).kind).toBe("starting");
    expect(kind({ createdAt: NOW / 1000 - STARTING_GRACE_S }).kind).toBe("runner_asleep");
  });

  it("doesn't mask a crash once the runner was seen online", () => {
    expect(kind({ createdAt: NOW / 1000 - 1, runnerEverOnline: true }).kind).toBe("runner_asleep");
  });

  it("doesn't apply to an import, which has no runner booting", () => {
    expect(kind({ createdAt: NOW / 1000 - 1, imported: true, hostOnline: null }).kind).toBe(
      "local_stranded",
    );
  });

  it("skips a missing or zero creation time", () => {
    expect(kind({ createdAt: 0 }).kind).toBe("runner_asleep");
    expect(kind({ createdAt: null }).kind).toBe("runner_asleep");
  });

  it("ends a host switch's grace at STARTING_GRACE_S after the launch", () => {
    expect(kind({ launchedAt: NOW - STARTING_GRACE_S * 1000 + 1 }).kind).toBe("starting");
    expect(kind({ launchedAt: NOW - STARTING_GRACE_S * 1000 }).kind).toBe("runner_asleep");
  });

  it("takes precedence over a host that reads down", () => {
    expect(kind({ hostId: "h", hostOnline: false, launchedAt: NOW - 1 }).kind).toBe("starting");
  });
});
