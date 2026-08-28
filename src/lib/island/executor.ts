import { invoke } from "@tauri-apps/api/core";

import { AGENT_INTEGRATIONS, launchAgent } from "@/lib/agent-integrations";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import i18n from "@/lib/i18n";
import { islandAction } from "@/lib/island/actions";
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
  // Requests can arrive from the detached window, so a caller-supplied path is
  // only ever honoured when it names a repository the user has open.
  if (request.path && !repoState.paths.includes(request.path)) {
    return fail(i18n.t("islandActions.unknownRepo", { path: request.path }));
  }

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
        invoke<string>("git_pull", {
          path,
          strategy: useWorkspacePrefs.getState().pullStrategy,
          opId,
        }),
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
      if (integration.surface === "chat") {
        if (
          integration.id === "codex" ||
          integration.id === "claude" ||
          integration.id === "opencode" ||
          integration.id === "cursor"
        ) {
          useAgentProviderStore.getState().setProvider(integration.id);
        }
        void router.navigate({ to: "/agents" });
      } else {
        launchAgent(path!, integration);
      }
      await restoreMainWindow();
      return ok(i18n.t("islandActions.agentLaunched", { agent: integration.label }));
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
