export type IslandActionGroup = "git" | "view" | "repo" | "agents" | "window";

export type IslandActionArg = {
  name: string;
  type: "string" | "boolean";
  required: boolean;
  description: string;
};

export type IslandActionDef = {
  id: string;
  group: IslandActionGroup;
  labelKey: string;
  keywords: string;
  needsRepo: boolean;
  args?: readonly IslandActionArg[];
  writes?: boolean;
};

const MESSAGE_ARG: IslandActionArg = {
  name: "message",
  type: "string",
  required: true,
  description: "The commit message. Use a Conventional Commits subject line.",
};

export const ISLAND_ACTIONS: readonly IslandActionDef[] = [
  {
    id: "git.push",
    group: "git",
    labelKey: "push",
    keywords: "push upload send hochladen senden",
    needsRepo: true,
    writes: true,
  },
  {
    id: "git.pull",
    group: "git",
    labelKey: "pull",
    keywords: "pull sync holen aktualisieren",
    needsRepo: true,
    writes: true,
  },
  {
    id: "git.fetch",
    group: "git",
    labelKey: "fetch",
    keywords: "fetch refresh remote abrufen",
    needsRepo: true,
    writes: true,
  },
  {
    id: "git.stageAll",
    group: "git",
    labelKey: "stageAll",
    keywords: "stage add all vormerken hinzufuegen",
    needsRepo: true,
    writes: true,
  },
  {
    id: "git.unstageAll",
    group: "git",
    labelKey: "unstageAll",
    keywords: "unstage reset all zuruecknehmen",
    needsRepo: true,
    writes: true,
  },
  {
    id: "git.commit",
    group: "git",
    labelKey: "commit",
    keywords: "commit einchecken",
    needsRepo: true,
    writes: true,
    args: [MESSAGE_ARG],
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
  },
  {
    id: "git.refresh",
    group: "git",
    labelKey: "refresh",
    keywords: "refresh reload neu laden aktualisieren",
    needsRepo: true,
  },

  { id: "view.commit", group: "view", labelKey: "viewCommit", keywords: "commit panel changes working copy", needsRepo: true },
  { id: "view.history", group: "view", labelKey: "viewHistory", keywords: "history log graph verlauf", needsRepo: true },
  { id: "view.stash", group: "view", labelKey: "viewStash", keywords: "stash list", needsRepo: true },
  { id: "view.pr", group: "view", labelKey: "viewPr", keywords: "pr pull request merge request", needsRepo: true },
  { id: "view.ci", group: "view", labelKey: "viewCi", keywords: "ci checks pipeline build actions", needsRepo: true },
  { id: "view.worktrees", group: "view", labelKey: "viewWorktrees", keywords: "worktree", needsRepo: true },
  { id: "view.hooks", group: "view", labelKey: "viewHooks", keywords: "hooks", needsRepo: true },
  { id: "view.submodules", group: "view", labelKey: "viewSubmodules", keywords: "submodule", needsRepo: true },
  { id: "view.tools", group: "view", labelKey: "viewTools", keywords: "tools scripts werkzeuge", needsRepo: true },
  { id: "view.dashboard", group: "view", labelKey: "viewDashboard", keywords: "dashboard overview uebersicht", needsRepo: false },
  { id: "view.agents", group: "view", labelKey: "viewAgents", keywords: "agents chat claude codex cursor", needsRepo: false },
  { id: "view.inbox", group: "view", labelKey: "viewInbox", keywords: "inbox notifications posteingang", needsRepo: false },
  { id: "view.settings", group: "view", labelKey: "viewSettings", keywords: "settings preferences einstellungen", needsRepo: false },
  { id: "view.reflog", group: "view", labelKey: "viewReflog", keywords: "reflog undo history", needsRepo: true },
  { id: "view.commandLog", group: "view", labelKey: "viewCommandLog", keywords: "command log transparency git log", needsRepo: false },
  { id: "view.terminal", group: "view", labelKey: "viewTerminal", keywords: "terminal shell console", needsRepo: true },

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
  },
  { id: "repo.reveal", group: "repo", labelKey: "reveal", keywords: "reveal finder explorer folder ordner", needsRepo: true },
  { id: "repo.terminal", group: "repo", labelKey: "openTerminal", keywords: "terminal external system", needsRepo: true },
  { id: "repo.ide", group: "repo", labelKey: "openIde", keywords: "ide editor vscode code", needsRepo: true },

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
  },

  { id: "window.minimize", group: "window", labelKey: "minimizeApp", keywords: "minimize hide l8git fenster minimieren", needsRepo: false },
  { id: "window.restore", group: "window", labelKey: "restoreApp", keywords: "restore show l8git fenster wiederherstellen", needsRepo: false },
  { id: "window.detach", group: "window", labelKey: "detachIsland", keywords: "detach float island abloesen schweben", needsRepo: false },
  { id: "window.attach", group: "window", labelKey: "attachIsland", keywords: "attach dock island andocken", needsRepo: false },
] as const;

const BY_ID = new Map(ISLAND_ACTIONS.map((action) => [action.id, action]));

export function islandAction(id: string): IslandActionDef | undefined {
  return BY_ID.get(id);
}

export function listedIslandActions(): IslandActionDef[] {
  return [...ISLAND_ACTIONS];
}

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
