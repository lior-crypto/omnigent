import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceFile } from "@/hooks/useWorkspaceChangedFiles";

import { FilesTree, type FilesTreeProps } from "./FilesTree";

const file = (path: string): WorkspaceFile => ({
  path,
  name: path.split("/").at(-1)!,
  type: "file",
  bytes: 10,
  modified_at: null,
});

function renderTree(rootEntries: readonly WorkspaceFile[], onFileSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const props = (entries: readonly WorkspaceFile[]): FilesTreeProps => ({
    conversationId: "conv_tree",
    browseLocation: "",
    rootEntries: entries,
    changedFiles: [],
    sort: "alpha",
    showHidden: false,
    refreshToken: 0,
    onFileSelect,
    reveal: null,
    label: "Workspace files",
  });
  const view = render(<FilesTree {...props(rootEntries)} />, { wrapper });
  return {
    onFileSelect,
    populate: (entries: readonly WorkspaceFile[]) =>
      view.rerender(<FilesTree {...props(entries)} />),
  };
}

afterEach(cleanup);

describe("FilesTree", () => {
  it("opens a file in a folder that was empty when the tree first showed it", async () => {
    const tree = renderTree([]);
    expect(screen.getByText("This folder is empty.")).toBeInTheDocument();

    await act(async () => tree.populate([file("README.md")]));
    const row = await screen.findByRole("treeitem", { name: /README\.md/ });
    fireEvent.click(row);

    expect(tree.onFileSelect.mock.calls.map(([path]) => path)).toEqual(["README.md"]);
  });
});
