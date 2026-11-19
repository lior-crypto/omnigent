import { describe, expect, it } from "vitest";
import { saveStatusOf } from "./useSaveStatusReport";

const quiet = {
  writePending: false,
  writeError: false,
  writeSuccess: false,
  saveDisabled: false,
  isDirty: false,
};

describe("saveStatusOf", () => {
  it.each([
    ["a clean editor", {}, "idle"],
    ["unsaved edits", { isDirty: true }, "unsaved"],
    ["a save in flight", { isDirty: true, writePending: true }, "saving"],
    ["a failed save with edits left", { isDirty: true, writeError: true }, "error"],
    ["a failed save reverted to clean", { writeError: true }, "idle"],
    ["edits while saving is unavailable", { isDirty: true, saveDisabled: true }, "offline"],
    ["a finished save", { writeSuccess: true }, "saved"],
    ["edits after a finished save", { writeSuccess: true, isDirty: true }, "unsaved"],
  ])("reports %s", (_label, inputs, expected) => {
    expect(saveStatusOf({ ...quiet, ...inputs })).toBe(expected);
  });
});
