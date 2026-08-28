import { invoke } from "@tauri-apps/api/core";

import { AGENT_INTEGRATIONS, launchAgent } from "@/lib/agent-integrations";
import i18n from "@/lib/i18n";
import { islandAction } from "@/lib/island/actions";
import { buildIslandSnapshot } from "@/lib/island/snapshot";
import type { IslandRequest, IslandResult } from "@/lib/island/types";
import {
  closeIslandWindow,
  minimizeMainWindow,
  openIslandWindow,
  restoreMainWindow,
  storedIslandWindowPosition,
} from "@/lib/island/window-store";
import { isRemoteCanceled, runRemoteOp } from "@/lib/remote-ops";
import { repoLabel, useRepoStore } from "@/lib/repo-store";
import { router } from "@/lib/router";
import { useTerminalStore } from "@/lib/terminal-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";

function ok(message: string, data?: unknown): IslandResult {
  return { ok: true, message, data };
}

function fail(message: string): IslandResult {
  return { ok: false, message };
}

/** Diffs go into a prompt, so they get a hard ceiling. */
const MAX_DIFF_CHARS = 12_000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (truncated)`;
}

function clampLimit(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function str(
  request: IslandRequest,
  name: string,
): string | undefined {
  const value = request.args?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(request: IslandRequest, name: string): boolean | undefined {
  const value = request.args?.[name];
  return typeof value === "boolean" ? value : undefined;
}

function openSidebar(tab: SidebarTab) {
  useUiStore.getState().setSidebarTab(tab);
  void router.navigate({ to: "/" });
}

const SIDEBAR_ACTIONS: Record<string, SidebarTab> = {
  "view.commit": "commit",
  "view.history": "history",
  "view.stash": "stash",
  "view.pr": "pr",
  "view.ci": "ci",
  "view.worktrees": "worktrees",
  "view.hooks": "hooks",
  "view.submodules": "submodules",
  "view.tools": "tools",
};

const ROUTE_ACTIONS: Record<string, string> = {
  "view.dashboard": "/dashboard",
  "view.agents": "/agents",
  "view.inbox": "/inbox",
  "view.settings": "/settings",
};

/**
 * Executes one island action against the live app state. Always runs in the
 * main window: the detached island sends its requests here so there is a single
 * source of truth for repository state.
 */
export async function runIslandAction(
  request: IslandRequest,
): Promise<IslandResult> {
  const def = islandAction(request.actionId);
  if (!def) return fail(i18n.t("islandActions.unknown", { id: request.actionId }));

  const repoState = useRepoStore.getState();
  const path = request.path ?? repoState.activePath;
  if (def.needsRepo && !path) return fail(i18n.t("islandActions.noRepo"));

  try {
    return await execute(def.id, request, path);
  } catch (error) {
    if (isRemoteCanceled(error)) {
      return fail(i18n.t("remoteProgress.canceledToast"));
    }
    return fail(error instanceof Error ? error.message : String(error));
  }
}

async function execute(
  id: string,
  request: IslandRequest,
  path: string | null,
): Promise<IslandResult> {
  const repo = useRepoStore.getState();
  const done = i18n.t("islandActions.done");

  const sidebarTab = SIDEBAR_ACTIONS[id];
  if (sidebarTab) {
    if (path && path !== repo.activePath) repo.setActive(path);
    openSidebar(sidebarTab);
    await restoreMainWindow();
    return ok(done);
  }

  const route = ROUTE_ACTIONS[id];
  if (route) {
    void router.navigate({ to: route });
    await restoreMainWindow();
    return ok(done);
  }

  switch (id) {
    case "git.push":
      await runRemoteOp("push", path!, (opId) =>
        invoke<string>("git_push", {
          path,
          setUpstream: false,
          forceMode: null,
          tagsMode: null,
          atomic: false,
          noVerify: false,
          dryRun: false,
          opId,
        }),
      );
      await repo.reload(path!);
      return ok(i18n.t("islandActions.pushed"));

    case "git.pull":
      await runRemoteOp("pull", path!, (opId) =>
        invoke<string>("git_pull", { path, strategy: "merge", opId }),
      );
      await repo.reload(path!);
      return ok(i18n.t("islandActions.pulled"));

    case "git.fetch":
      await runRemoteOp("fetch", path!, (opId) =>
        invoke<string>("git_fetch", { path, opId }),
      );
      await repo.reload(path!);
      return ok(i18n.t("islandActions.fetched"));

    case "git.stageAll": {
      const files = (repo.status[path!] ?? [])
        .filter((entry) => entry.unstaged || entry.untracked)
        .map((entry) => entry.path);
      if (files.length === 0) return ok(i18n.t("islandActions.nothingToStage"));
      await repo.stageFiles(path!, files);
      return ok(i18n.t("islandActions.staged", { count: files.length }));
    }

    case "git.unstageAll": {
      const files = (repo.status[path!] ?? [])
        .filter((entry) => entry.staged)
        .map((entry) => entry.path);
      if (files.length === 0) return ok(i18n.t("islandActions.nothingToUnstage"));
      await repo.unstageFiles(path!, files);
      return ok(i18n.t("islandActions.unstaged", { count: files.length }));
    }

    case "git.commit": {
      const message = str(request, "message");
      if (!message) return fail(i18n.t("islandActions.missingArg", { name: "message" }));
      await repo.commitChanges(path!, message);
      return ok(i18n.t("islandActions.committed"));
    }

    case "git.checkout": {
      const branch = str(request, "branch");
      if (!branch) return fail(i18n.t("islandActions.missingArg", { name: "branch" }));
      await repo.checkoutBranch(path!, branch);
      return ok(i18n.t("islandActions.checkedOut", { branch }));
    }

    case "git.createBranch": {
      const name = str(request, "name");
      if (!name) return fail(i18n.t("islandActions.missingArg", { name: "name" }));
      await repo.createBranch(path!, name, str(request, "base"), bool(request, "checkout") ?? true);
      return ok(i18n.t("islandActions.branchCreated", { name }));
    }

    case "git.stash":
      await repo.stashPush(path!, str(request, "message"), { includeUntracked: true });
      return ok(i18n.t("islandActions.stashed"));

    case "git.refresh":
      await repo.reload(path!);
      return ok(done);

    case "view.reflog":
      useUiStore.getState().openReflogView(path!);
      await restoreMainWindow();
      return ok(done);

    case "view.commandLog":
      useUiStore.getState().openCommandLog();
      await restoreMainWindow();
      return ok(done);

    case "view.terminal":
      useTerminalStore.getState().toggleVisible(path!);
      await restoreMainWindow();
      return ok(done);

    case "repo.activate": {
      const target = request.path ?? str(request, "path");
      if (!target) return fail(i18n.t("islandActions.missingArg", { name: "path" }));
      if (!repo.paths.includes(target)) {
        return fail(i18n.t("islandActions.unknownRepo", { path: target }));
      }
      repo.setActive(target);
      return ok(i18n.t("islandActions.activated", { repo: repoLabel(target) }));
    }

    case "repo.reveal":
      await invoke("reveal_repo_folder", { path });
      return ok(done);

    case "repo.terminal":
      await invoke("open_repo_terminal", {
        path,
        useGitBash: useWorkspacePrefs.getState().repoTerminalKind === "git_bash",
      });
      return ok(done);

    case "repo.ide": {
      const ide = useWorkspacePrefs.getState().ideLaunchCommand.trim();
      if (!ide) return fail(i18n.t("islandActions.noIde"));
      await invoke("open_repo_in_ide", { path, ideLaunch: ide });
      return ok(done);
    }

    case "agent.launch": {
      const integrationId = str(request, "integrationId");
      const integration = AGENT_INTEGRATIONS.find((i) => i.id === integrationId);
      if (!integration) {
        return fail(i18n.t("islandActions.unknownAgent", { id: integrationId ?? "" }));
      }
      launchAgent(path!, integration);
      await restoreMainWindow();
      return ok(i18n.t("islandActions.agentLaunched", { agent: integration.label }));
    }

    case "read.repos":
      return ok(
        done,
        buildIslandSnapshot().repos.map((entry) => ({
          path: entry.path,
          name: entry.label,
          branch: entry.branch,
          uncommittedChanges: entry.dirty,
          ahead: entry.ahead,
          behind: entry.behind,
          active: entry.path === repo.activePath,
        })),
      );

    case "read.status": {
      await repo.reloadStatus(path!);
      const entries = useRepoStore.getState().status[path!] ?? [];
      return ok(done, {
        branch: repo.repos[path!]?.branch ?? "",
        staged: entries.filter((e) => e.staged).map((e) => e.path),
        unstaged: entries.filter((e) => e.unstaged).map((e) => e.path),
        untracked: entries.filter((e) => e.untracked).map((e) => e.path),
      });
    }

    case "read.branches": {
      const info = repo.repos[path!];
      return ok(done, {
        current: info?.branch ?? "",
        branches: (info?.branches ?? []).map((branch) => ({
          name: branch.name,
          remote: branch.is_remote,
          current: branch.is_current,
        })),
      });
    }

    case "read.commits": {
      const limit = clampLimit(str(request, "limit"), 15, 50);
      return ok(
        done,
        (repo.repos[path!]?.commits ?? []).slice(0, limit).map((commit) => ({
          hash: commit.short_hash,
          subject: commit.subject,
          author: commit.author,
          date: commit.date,
        })),
      );
    }

    case "read.diff": {
      const file = str(request, "file");
      if (!file) {
        const diff = await invoke<string>("repo_staged_diff", { path });
        return ok(done, truncate(diff, MAX_DIFF_CHARS));
      }
      const entry = (repo.status[path!] ?? []).find((e) => e.path === file);
      const payload = await invoke<{ staged: string | null; unstaged: string | null }>(
        "repo_file_diff",
        { path, file, untracked: entry?.untracked ?? false },
      );
      return ok(done, truncate(payload.unstaged ?? payload.staged ?? "", MAX_DIFF_CHARS));
    }

    case "window.minimize":
      await minimizeMainWindow();
      return ok(done);

    case "window.restore":
      await restoreMainWindow();
      return ok(done);

    case "window.detach":
      await openIslandWindow(storedIslandWindowPosition());
      return ok(done);

    case "window.attach":
      await closeIslandWindow();
      return ok(done);

    default:
      return fail(i18n.t("islandActions.unknown", { id }));
  }
}
