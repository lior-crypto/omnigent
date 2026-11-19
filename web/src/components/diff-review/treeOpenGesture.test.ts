import { describe, expect, it } from "vitest";

import type { KeyChordInput } from "@/lib/shortcuts/chord";

import { treeKeyOpen, treeMiddleClickOpen } from "./treeOpenGesture";

const pointer = { button: 1, shiftKey: false, metaKey: false, ctrlKey: false };
const enter = (overrides: Partial<KeyChordInput> = {}): KeyChordInput => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe("treeMiddleClickOpen", () => {
  it("opens a file row behind, or switches to it with Shift", () => {
    expect(treeMiddleClickOpen(pointer, "src/a.ts")).toEqual({
      path: "src/a.ts",
      background: true,
    });
    expect(treeMiddleClickOpen({ ...pointer, shiftKey: true }, "src/a.ts")).toEqual({
      path: "src/a.ts",
      background: false,
    });
  });

  it("ignores other buttons, folders and clicks outside rows", () => {
    expect(treeMiddleClickOpen({ ...pointer, button: 0 }, "src/a.ts")).toBeNull();
    expect(treeMiddleClickOpen({ ...pointer, button: 2 }, "src/a.ts")).toBeNull();
    expect(treeMiddleClickOpen(pointer, "src/")).toBeNull();
    expect(treeMiddleClickOpen(pointer, null)).toBeNull();
  });
});

describe("treeKeyOpen", () => {
  it("opens on ⌘Enter, switching with ⇧, on macOS", () => {
    expect(treeKeyOpen(enter({ metaKey: true }), "a.ts", true)).toEqual({
      path: "a.ts",
      background: true,
    });
    expect(treeKeyOpen(enter({ metaKey: true, shiftKey: true }), "a.ts", true)).toEqual({
      path: "a.ts",
      background: false,
    });
  });

  it("opens on Ctrl+Enter, switching with ⇧, off macOS", () => {
    expect(treeKeyOpen(enter({ ctrlKey: true }), "a.ts", false)).toEqual({
      path: "a.ts",
      background: true,
    });
    expect(treeKeyOpen(enter({ ctrlKey: true, shiftKey: true }), "a.ts", false)).toEqual({
      path: "a.ts",
      background: false,
    });
  });

  it("leaves the tree's own keys, folders and other platforms' chords alone", () => {
    expect(treeKeyOpen(enter(), "a.ts", true)).toBeNull();
    expect(treeKeyOpen(enter({ metaKey: true, key: " " }), "a.ts", true)).toBeNull();
    expect(treeKeyOpen(enter({ ctrlKey: true }), "a.ts", true)).toBeNull();
    expect(treeKeyOpen(enter({ metaKey: true }), "src/", true)).toBeNull();
    expect(treeKeyOpen(enter({ metaKey: true }), null, true)).toBeNull();
  });
});
