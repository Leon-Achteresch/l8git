import { isTauri } from "@tauri-apps/api/core";

import { useRepoStore, type Commit, type RepoInfo } from "@/lib/repo-store";

export const PREVIEW_REPO_PATH = "/preview/testrepo";

const previewCommits: Commit[] = [
  {
    hash: "9f3a7c1d4e2b6a8f0c1d9e7b5a3f1c8d6e4b2a10",
    short_hash: "9f3a7c1",
    author: "Alex Morgan",
    email: "alex@example.com",
    date: "2026-09-09T14:32:00Z",
    subject: "Polish repository workspace surfaces",
    body: "",
    parents: ["4c8e2a1b7d6f5e3c1a9b8d7f6e5c4b3a2d1e0f9"],
    tags: [],
  },
  {
    hash: "4c8e2a1b7d6f5e3c1a9b8d7f6e5c4b3a2d1e0f9",
    short_hash: "4c8e2a1",
    author: "Jamie Chen",
    email: "jamie@example.com",
    date: "2026-09-08T09:18:00Z",
    subject: "Add workspace activity summary",
    body: "",
    parents: ["a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"],
    tags: ["v0.6.0"],
  },
  {
    hash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    short_hash: "a1b2c3d",
    author: "Alex Morgan",
    email: "alex@example.com",
    date: "2026-09-05T16:44:00Z",
    subject: "Create initial application shell",
    body: "",
    parents: [],
    tags: [],
  },
];

const previewRepo: RepoInfo = {
  path: PREVIEW_REPO_PATH,
  branch: "main",
  commits: previewCommits,
  branches: [
    { name: "main", is_current: true, is_remote: false, tip: previewCommits[0].hash },
    { name: "feature/activity", is_current: false, is_remote: false, tip: previewCommits[1].hash },
    { name: "origin/main", is_current: false, is_remote: true, tip: previewCommits[0].hash },
  ],
  tags: [
    {
      name: "v0.6.0",
      commit: previewCommits[1].hash,
      kind: "annotated",
      message: "Preview release",
      tagger: "Jamie Chen",
    },
  ],
};

export function isPreviewRepo(path: string | null | undefined): boolean {
  return path === PREVIEW_REPO_PATH;
}

export function seedPreviewRepo(): void {
  if (!import.meta.env.DEV || isTauri()) return;

  const state = useRepoStore.getState();
  if (state.paths.includes(PREVIEW_REPO_PATH)) {
    useRepoStore.setState({
      activePath: PREVIEW_REPO_PATH,
      repos: state.repos[PREVIEW_REPO_PATH]
        ? state.repos
        : { ...state.repos, [PREVIEW_REPO_PATH]: previewRepo },
      status: state.status[PREVIEW_REPO_PATH]
        ? state.status
        : { ...state.status, [PREVIEW_REPO_PATH]: previewStatus },
      upstreamSync: state.upstreamSync[PREVIEW_REPO_PATH]
        ? state.upstreamSync
        : { ...state.upstreamSync, [PREVIEW_REPO_PATH]: { ahead: 2, behind: 0 } },
      hasUpstream: state.hasUpstream[PREVIEW_REPO_PATH] === undefined
        ? { ...state.hasUpstream, [PREVIEW_REPO_PATH]: true }
        : state.hasUpstream,
    });
    return;
  }

  useRepoStore.setState({
    paths: [...state.paths, PREVIEW_REPO_PATH],
    activePath: PREVIEW_REPO_PATH,
    repos: { ...state.repos, [PREVIEW_REPO_PATH]: previewRepo },
    status: { ...state.status, [PREVIEW_REPO_PATH]: previewStatus },
    upstreamSync: { ...state.upstreamSync, [PREVIEW_REPO_PATH]: { ahead: 2, behind: 0 } },
    hasUpstream: { ...state.hasUpstream, [PREVIEW_REPO_PATH]: true },
  });
}

const previewStatus = [
  {
    path: "src/components/repo/layout/empty-state.tsx",
    index_status: " ",
    worktree_status: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    additions_staged: 0,
    deletions_staged: 0,
    additions_unstaged: 18,
    deletions_unstaged: 6,
    binary: false,
    embedded_repo: false,
  },
];
