// Which changed-file row a middle click or ⌘Enter in the review tree opens in a
// new tab. ⌘-click and ⇧-click stay the tree's own multi-select, so they never open.

import { isNewTabEnter, pullRequestOpenIntent } from "@/shell/pullRequestOpenIntent";
import type { KeyChordInput } from "@/lib/shortcuts/chord";
import { isMacPlatform } from "@/lib/hotkeys";

export interface TreeNewTabOpen {
  path: string;
  /** Open behind the current tab; false switches to it (the gesture added Shift). */
  background: boolean;
}

/** Folders end in a slash in the tree and have nothing to open. */
const isFileRow = (path: string | null): path is string => !!path && !path.endsWith("/");

/** A middle click on a file row; ⇧ switches to the new tab. */
export function treeMiddleClickOpen(
  event: { button: number; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  path: string | null,
): TreeNewTabOpen | null {
  if (event.button !== 1 || !isFileRow(path)) return null;
  return { path, background: pullRequestOpenIntent(event) === "background" };
}

/** ⌘Enter (Ctrl+Enter off macOS) on a focused file row; ⇧ switches to the new tab. */
export function treeKeyOpen(
  event: KeyChordInput,
  path: string | null,
  mac: boolean = isMacPlatform(),
): TreeNewTabOpen | null {
  if (!isFileRow(path) || !isNewTabEnter(event, mac)) return null;
  return { path, background: pullRequestOpenIntent(event, mac) === "background" };
}
