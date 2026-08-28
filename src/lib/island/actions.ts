/**
 * Every l8git operation the island can trigger, in one registry.
 *
 * The registry is the single source of truth for three consumers: the command
 * list inside the island, the AI chat (each entry with an `ai` description
 * becomes a callable tool) and the host that actually executes them. Keeping
 * them together is what makes "do the rest of l8git from the island" one list
 * to extend instead of three.
 */

export type IslandActionGroup = "git" | "view" | "repo" | "agents" | "window";

export type IslandActionArg = {
  name: string;
  type: "string" | "boolean";
  required: boolean;
  /** Shown to the model, so it is written in English on purpose. */
  description: string;
};

export type IslandActionDef = {
  id: string;
  group: IslandActionGroup;
  /** i18n key under `islandActions.` */
  labelKey: string;
  /** Latin search terms, lowercase, for the fuzzy list. */
  keywords: string;
  needsRepo: boolean;
  /** When set the action is exposed to the AI chat as a tool. */
  ai?: string;
  args?: readonly IslandActionArg[];
  /** Changes the working tree or talks to a remote. */
  writes?: boolean;
  /** Not offered in the command list — only reachable from the AI chat. */
  hidden?: boolean;
};

const MESSAGE_ARG: IslandActionArg = {
  name: "message",
  type: "string",
  required: true,
  description: "The commit message. Use a Conventional Commits subject line.",
};

export const ISLAND_ACTIONS: readonly IslandActionDef[] = [
  // --- git -----------------------------------------------------------------
  {
    id: "git.push",
    group: "git",
    labelKey: "push",
    keywords: "push upload send hochladen senden",
    needsRepo: true,
    writes: true,
    ai: "Push the current branch to its remote.",
  },
  {
    id: "git.pull",
    group: "git",
    labelKey: "pull",
    keywords: "pull sync holen aktualisieren",
    needsRepo: true,
    writes: true,
    ai: "Pull the current branch from its remote (merge strategy).",
  },
  {
    id: "git.fetch",
    group: "git",
    labelKey: "fetch",
    keywords: "fetch refresh remote abrufen",
    needsRepo: true,
    writes: true,
    ai: "Fetch all remotes without changing the working tree.",
  },
  {
    id: "git.stageAll",
    group: "git",
    labelKey: "stageAll",
    keywords: "stage add all vormerken hinzufuegen",
    needsRepo: true,
    writes: true,
    ai: "Stage every changed and untracked file.",
  },
  {
    id: "git.unstageAll",
    group: "git",
    labelKey: "unstageAll",
    keywords: "unstage reset all zuruecknehmen",
    needsRepo: true,
    writes: true,
    ai: "Unstage everything that is currently staged.",
  },
  {
    id: "git.commit",
    group: "git",
    labelKey: "commit",
    keywords: "commit einchecken",
    needsRepo: true,
    writes: true,
    args: [MESSAGE_ARG],
    ai: "Commit the staged changes. Fails when nothing is staged, so stage first.",
  },
  {
    id: "git.checkout",
    group: "git",
    labelKey: "checkout",
    keywords: "checkout switch branch wechseln",
    needsRepo: true,
    writes: true,
    args: [
      {
        name: "branch",
        type: "string",
        required: true,
        description: "Name of an existing local branch.",
      },
    ],
    ai: "Switch the working tree to an existing local branch.",
  },
  {
    id: "git.createBranch",
    group: "git",
    labelKey: "createBranch",
    keywords: "branch create new zweig anlegen",
    needsRepo: true,
    writes: true,
    args: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Name of the new branch.",
      },
      {
        name: "base",
        type: "string",
        required: false,
        description: "Branch or commit to start from. Defaults to HEAD.",
      },
      {
        name: "checkout",
        type: "boolean",
        required: false,
        description: "Switch to the new branch after creating it. Defaults to true.",
      },
    ],
    ai: "Create a branch, optionally from a given base, and check it out.",
  },
  {
    id: "git.stash",
    group: "git",
    labelKey: "stash",
    keywords: "stash save shelve zwischenspeichern",
    needsRepo: true,
    writes: true,
    args: [
      {
        name: "message",
        type: "string",
        required: false,
        description: "Optional label for the stash entry.",
      },
    ],
    ai: "Stash all uncommitted changes.",
  },
  {
    id: "git.refresh",
    group: "git",
    labelKey: "refresh",
    keywords: "refresh reload neu laden aktualisieren",
    needsRepo: true,
    ai: "Re-read the repository state from disk.",
  },

  // --- views ---------------------------------------------------------------
  { id: "view.commit", group: "view", labelKey: "viewCommit", keywords: "commit panel changes working copy", needsRepo: true, ai: "Open the commit panel in the main window." },
  { id: "view.history", group: "view", labelKey: "viewHistory", keywords: "history log graph verlauf", needsRepo: true, ai: "Open the history view in the main window." },
  { id: "view.stash", group: "view", labelKey: "viewStash", keywords: "stash list", needsRepo: true },
  { id: "view.pr", group: "view", labelKey: "viewPr", keywords: "pr pull request merge request", needsRepo: true, ai: "Open the pull request list in the main window." },
  { id: "view.ci", group: "view", labelKey: "viewCi", keywords: "ci checks pipeline build actions", needsRepo: true, ai: "Open the CI checks view in the main window." },
  { id: "view.worktrees", group: "view", labelKey: "viewWorktrees", keywords: "worktree", needsRepo: true },
  { id: "view.hooks", group: "view", labelKey: "viewHooks", keywords: "hooks", needsRepo: true },
  { id: "view.submodules", group: "view", labelKey: "viewSubmodules", keywords: "submodule", needsRepo: true },
  { id: "view.tools", group: "view", labelKey: "viewTools", keywords: "tools scripts werkzeuge", needsRepo: true },
  { id: "view.dashboard", group: "view", labelKey: "viewDashboard", keywords: "dashboard overview uebersicht", needsRepo: false, ai: "Open the dashboard in the main window." },
  { id: "view.agents", group: "view", labelKey: "viewAgents", keywords: "agents chat claude codex cursor", needsRepo: false, ai: "Open the agents page in the main window." },
  { id: "view.inbox", group: "view", labelKey: "viewInbox", keywords: "inbox notifications posteingang", needsRepo: false, ai: "Open the inbox in the main window." },
  { id: "view.settings", group: "view", labelKey: "viewSettings", keywords: "settings preferences einstellungen", needsRepo: false, ai: "Open the settings page in the main window." },
  { id: "view.reflog", group: "view", labelKey: "viewReflog", keywords: "reflog undo history", needsRepo: true },
  { id: "view.commandLog", group: "view", labelKey: "viewCommandLog", keywords: "command log transparency git log", needsRepo: false },
  { id: "view.terminal", group: "view", labelKey: "viewTerminal", keywords: "terminal shell console", needsRepo: true, ai: "Toggle the embedded terminal in the main window." },

  // --- repository ----------------------------------------------------------
  {
    id: "repo.activate",
    group: "repo",
    labelKey: "activate",
    keywords: "switch repo project wechseln projekt",
    needsRepo: false,
    args: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "Absolute path of an already opened repository.",
      },
    ],
    ai: "Make one of the opened repositories the active one.",
  },
  { id: "repo.reveal", group: "repo", labelKey: "reveal", keywords: "reveal finder explorer folder ordner", needsRepo: true, ai: "Reveal the repository folder in the OS file manager." },
  { id: "repo.terminal", group: "repo", labelKey: "openTerminal", keywords: "terminal external system", needsRepo: true },
  { id: "repo.ide", group: "repo", labelKey: "openIde", keywords: "ide editor vscode code", needsRepo: true, ai: "Open the repository in the configured IDE." },

  // --- agents --------------------------------------------------------------
  {
    id: "agent.launch",
    group: "agents",
    labelKey: "launchAgent",
    keywords: "agent claude codex opencode cursor start",
    needsRepo: true,
    args: [
      {
        name: "integrationId",
        type: "string",
        required: true,
        description: "Id of the agent integration, e.g. claude, codex, opencode, cursor.",
      },
    ],
    ai: "Start or focus a coding agent CLI for the active repository.",
  },

  // --- read only, chat exclusive -------------------------------------------
  {
    id: "read.repos",
    group: "repo",
    labelKey: "readRepos",
    keywords: "",
    needsRepo: false,
    hidden: true,
    ai: "List every opened repository with its path, branch and number of uncommitted changes.",
  },
  {
    id: "read.status",
    group: "repo",
    labelKey: "readStatus",
    keywords: "",
    needsRepo: true,
    hidden: true,
    ai: "Read `git status` of the active repository: staged, unstaged and untracked files.",
  },
  {
    id: "read.branches",
    group: "repo",
    labelKey: "readBranches",
    keywords: "",
    needsRepo: true,
    hidden: true,
    ai: "List the local and remote branches of the active repository plus the current branch.",
  },
  {
    id: "read.commits",
    group: "repo",
    labelKey: "readCommits",
    keywords: "",
    needsRepo: true,
    hidden: true,
    args: [
      {
        name: "limit",
        type: "string",
        required: false,
        description: "How many commits to return, 1-50. Defaults to 15.",
      },
    ],
    ai: "List the most recent commits of the active repository.",
  },
  {
    id: "read.diff",
    group: "repo",
    labelKey: "readDiff",
    keywords: "",
    needsRepo: true,
    hidden: true,
    args: [
      {
        name: "file",
        type: "string",
        required: false,
        description:
          "Repository relative path. When given, returns that file's working tree diff; otherwise the staged diff.",
      },
    ],
    ai: "Read the staged diff of the active repository, or the working tree diff of one file. Long diffs are truncated.",
  },

  // --- window --------------------------------------------------------------
  { id: "window.minimize", group: "window", labelKey: "minimizeApp", keywords: "minimize hide l8git fenster minimieren", needsRepo: false, ai: "Minimize the main l8git window. The island stays usable." },
  { id: "window.restore", group: "window", labelKey: "restoreApp", keywords: "restore show l8git fenster wiederherstellen", needsRepo: false, ai: "Restore and focus the main l8git window." },
  { id: "window.detach", group: "window", labelKey: "detachIsland", keywords: "detach float island abloesen schweben", needsRepo: false },
  { id: "window.attach", group: "window", labelKey: "attachIsland", keywords: "attach dock island andocken", needsRepo: false },
] as const;

const BY_ID = new Map(ISLAND_ACTIONS.map((action) => [action.id, action]));

export function islandAction(id: string): IslandActionDef | undefined {
  return BY_ID.get(id);
}

/** Actions the AI chat may call, in registry order. */
export function aiCallableActions(): IslandActionDef[] {
  return ISLAND_ACTIONS.filter((action) => !!action.ai);
}

/** Actions offered in the island's command list. */
export function listedIslandActions(): IslandActionDef[] {
  return ISLAND_ACTIONS.filter((action) => !action.hidden);
}

/** Tool name for the AI chat — dots are not allowed in tool names. */
export function islandToolName(action: IslandActionDef): string {
  return action.id.replace(/\./g, "_");
}

export function islandActionForTool(name: string): IslandActionDef | undefined {
  return ISLAND_ACTIONS.find((action) => islandToolName(action) === name);
}

/** Naive substring match over label and keywords — the list is short. */
export function searchIslandActions(
  actions: readonly IslandActionDef[],
  query: string,
  labelOf: (action: IslandActionDef) => string,
): IslandActionDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...actions];
  const terms = q.split(/\s+/);
  return actions.filter((action) => {
    const haystack = `${action.id} ${action.keywords} ${labelOf(action)}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
