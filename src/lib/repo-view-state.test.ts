import { afterEach, describe, expect, it } from "vitest";
import { forgetRepoViewState, readRepoScroll, readRepoViewState, saveRepoViewState } from "./repo-view-state";

const paths = Array.from({ length: 30 }, (_, i) => `/repo-view-test/${i}`);
afterEach(() => paths.forEach(forgetRepoViewState));

describe("repository session views", () => {
  it("keeps selections and scroll positions independent across repositories and views", () => {
    saveRepoViewState(paths[0], { selectedFile: "unstaged:one.txt" });
    saveRepoViewState(paths[0], { historyScroll: { context: "all", offset: 640 } });
    saveRepoViewState(paths[1], { selectedFile: "staged:two.txt" });

    expect(readRepoViewState(paths[0]).selectedFile).toBe("unstaged:one.txt");
    expect(readRepoViewState(paths[1]).selectedFile).toBe("staged:two.txt");
    expect(readRepoScroll(paths[0], "historyScroll", "all")).toBe(640);
    expect(readRepoScroll(paths[0], "historyScroll", "filtered")).toBe(0);
    expect(readRepoScroll(paths[0], "filesScroll", "all")).toBe(0);
    forgetRepoViewState(paths[0]);
    expect(readRepoViewState(paths[0])).toEqual({});
    expect(readRepoViewState(paths[1]).selectedFile).toBe("staged:two.txt");
  });

  it("bounds retained repositories while keeping recently updated views", () => {
    paths.slice(0, 24).forEach(path => saveRepoViewState(path, { selectedFile: path }));
    saveRepoViewState(paths[0], { selectedFile: "recent" });
    saveRepoViewState(paths[24], { selectedFile: "new" });
    expect(readRepoViewState(paths[1])).toEqual({});
    expect(readRepoViewState(paths[0]).selectedFile).toBe("recent");
    expect(readRepoViewState(paths[24]).selectedFile).toBe("new");
    saveRepoViewState("", { selectedFile: "no repository" });
    expect(readRepoViewState("")).toEqual({});
  });
});
