import { Button } from "@/components/ui/button";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpToLine,
  Bot,
  ClipboardCopy,
  CloudDownload,
  Code2,
  Compass,
  Columns2,
  Download,
  FileClock,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  GitPullRequest,
  History,
  Keyboard,
  LayoutDashboard,
  Layers,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Tag,
  Terminal,
  Undo2,
  Webhook,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "@tanstack/react-router";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { isRemoteCanceled, runRemoteOp } from "@/lib/remote-ops";
import { RepoSourceDialogs } from "@/components/repo/tabs/repo-source-dialogs";
import { toastError } from "@/lib/error-toast";
import { useEverTrue } from "@/lib/use-ever-true";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { useHotkeyBindings } from "@/lib/hotkey-prefs";
import i18n from "@/lib/i18n";
import { useRepoStore } from "@/lib/repo-store";
import { useRepoToolsStore } from "@/lib/repo-tools-store";
import { useHistorySelection } from "@/lib/use-history-hotkeys";
import { startOnboardingTour } from "@/lib/onboarding-prefs";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { usePickRepo } from "@/lib/use-pick-repo";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";

// The palette's dialogs are the app's single largest eager import — the
// interactive rebase editor alone drags all of dnd-kit into the startup chunk.
// None of them can be on screen before the user picks a command, so each one
// loads the first time it is opened.
const MergeDialog = lazy(() =>
  import("@/components/repo/branch/merge-dialog").then((m) => ({ default: m.MergeDialog })),
);
const NewBranchDialog = lazy(() =>
  import("@/components/repo/branch/new-branch-dialog").then((m) => ({ default: m.NewBranchDialog })),
);
const CommitTagDialog = lazy(() =>
  import("@/components/repo/commit/commit-tag-dialog").then((m) => ({ default: m.CommitTagDialog })),
);
const RebaseDialog = lazy(() =>
  import("@/components/repo/rebase/rebase-dialog").then((m) => ({ default: m.RebaseDialog })),
);
const ResetDialog = lazy(() =>
  import("@/components/repo/reset/reset-dialog").then((m) => ({ default: m.ResetDialog })),
);
const StashCreateDialog = lazy(() =>
  import("@/components/repo/stash/stash-create-dialog").then((m) => ({ default: m.StashCreateDialog })),
);
const UndoConfirmDialog = lazy(() =>
  import("@/components/repo/undo/undo-confirm-dialog").then((m) => ({ default: m.UndoConfirmDialog })),
);
const RebaseInteractiveEditor = lazy(() =>
  import("@/components/repo/rebase/rebase-interactive-editor").then((m) => ({
    default: m.RebaseInteractiveEditor,
  })),
);

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

const MERGE_SUGGESTION_LIMIT = 8;
const REPO_SWITCH_LIMIT = 8;
const PREVIEW_ACTIONS_PER_GROUP = 4;

function reportRemoteError(error: unknown) {
  if (isRemoteCanceled(error)) {
    toast.info(i18n.t("remoteProgress.canceledToast"));
    return;
  }
  toastError(String(error));
}

function repoLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

type ActionGroupId = "git" | "views" | "repo" | "prci";

type ActionItem = {
  id: string;
  group: ActionGroupId;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string;
};

export function AppHeaderSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const highlightedValue = useRef<string>("");
  const pickRepo = usePickRepo();
  const bindings = useHotkeyBindings();

  useHotkeys([
    {
      hotkey: bindings.commandPalette,
      callback: () => setOpen((o) => !o),
      options: {
        preventDefault: true,
        meta: { name: t("hotkeys.commandPalette") },
      },
    },
  ]);

  const { activePath, repo } = useRepoStore(
    useShallow((s) => ({
      activePath: s.activePath,
      repo: s.activePath ? s.repos[s.activePath] : null,
    })),
  );
  const openPaths = useRepoStore((s) => s.paths);
  const setActiveRepo = useRepoStore((s) => s.setActive);
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const stashes = useRepoStore((s) =>
    activePath ? s.stashes[activePath] : undefined,
  );
  const reloadStashes = useRepoStore((s) => s.reloadStashes);
  const statusEntries = useRepoStore((s) =>
    activePath ? s.status[activePath] : undefined,
  );
  const focusCommitFromBranchTip = useUiStore(
    (s) => s.focusCommitFromBranchTip,
  );
  const requestCommitHistoryFocus = useUiStore(
    (s) => s.requestCommitHistoryFocus,
  );
  const requestPrCreate = useUiStore((s) => s.requestPrCreate);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const openReflogView = useUiStore((s) => s.openReflogView);
  const openCommandLog = useUiStore((s) => s.openCommandLog);
  const openBlameEditor = useUiStore((s) => s.openBlameEditor);
  const toggleTerminal = useTerminalStore((s) => s.toggleVisible);
  const openTerminalTab = useTerminalStore((s) => s.openTab);
  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs((s) => s.repoTerminalKind);
  const historySelection = useHistorySelection();
  const tools = useRepoToolsStore((s) =>
    activePath ? s.toolsByPath[activePath] : undefined,
  );
  const loadTools = useRepoToolsStore((s) => s.loadTools);
  const [pendingTool, setPendingTool] = useState<{
    label: string;
    run: string;
  } | null>(null);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [rebaseEditorOpen, setRebaseEditorOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [stashCreateOpen, setStashCreateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<{
    hash: string;
    shortHash: string;
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const totalCommits = repo?.commits.length ?? 0;

  // A dialog that has been opened once stays mounted; before that it is absent
  // from the tree and its chunk is never fetched.
  const rebaseUsed = useEverTrue(rebaseOpen);
  const undoUsed = useEverTrue(undoOpen);
  const newBranchUsed = useEverTrue(newBranchOpen);
  const stashCreateUsed = useEverTrue(stashCreateOpen);

  // Refresh the repo's tool manifest whenever the palette opens.
  useEffect(() => {
    if (open && activePath) {
      void loadTools(activePath);
      void reloadStashes(activePath);
    }
  }, [open, activePath, loadTools, reloadStashes]);

  const branches = useMemo(() => repo?.branches ?? [], [repo]);
  const tags = useMemo(() => repo?.tags ?? [], [repo]);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? branches.filter((b) => b.name.toLowerCase().includes(q))
      : branches;
    return list.slice(0, 8);
  }, [branches, query]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tags.filter((tag) => tag.name.toLowerCase().includes(q)) : tags;
    return list.slice(0, 5);
  }, [tags, query]);

  const filteredCommits = useMemo(() => {
    if (!repo) return [];
    const q = query.trim().toLowerCase();
    if (!q) return repo.commits.slice(0, 10);
    return repo.commits
      .filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.short_hash.toLowerCase().startsWith(q) ||
          c.hash.toLowerCase().startsWith(q) ||
          c.author.toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [repo, query]);

  const selectedCommit = useMemo(() => {
    if (!activePath || !historySelection) return null;
    if (historySelection.path !== activePath) return null;
    return historySelection;
  }, [activePath, historySelection]);

  const headCommit = repo?.commits[0] ?? null;
  const currentBranch = repo?.branch ?? "";
  const stagedCount =
    statusEntries?.filter((entry) => entry.staged).length ?? 0;
  const unstagedCount =
    statusEntries?.filter((entry) => entry.unstaged || entry.untracked).length ??
    0;
  const stashCount = stashes?.length ?? 0;

  const allActions = useMemo((): ActionItem[] => {
    const tabActions: {
      id: SidebarTab;
      group: ActionGroupId;
      label: string;
      icon: React.ReactNode;
      keywords: string;
    }[] = [
      { id: "commit", group: "git", label: t("appSearch.actionTabCommit"), icon: <GitCommitHorizontal className="size-3.5" />, keywords: "commit stage panel arbeitskopie" },
      { id: "history", group: "views", label: t("appSearch.actionTabHistory"), icon: <History className="size-3.5" />, keywords: "history log verlauf historie" },
      { id: "pr", group: "prci", label: t("appSearch.actionTabPr"), icon: <GitPullRequest className="size-3.5" />, keywords: "pr pull request merge request liste list" },
      { id: "ci", group: "prci", label: t("appSearch.actionTabCi"), icon: <ListChecks className="size-3.5" />, keywords: "ci pipeline build checks workflow actions" },
      { id: "stash", group: "views", label: t("appSearch.actionTabStash"), icon: <Archive className="size-3.5" />, keywords: "stash stapel" },
      { id: "worktrees", group: "views", label: t("appSearch.actionTabWorktrees"), icon: <GitFork className="size-3.5" />, keywords: "worktree arbeitsbaum" },
      { id: "hooks", group: "views", label: t("appSearch.actionTabHooks"), icon: <Webhook className="size-3.5" />, keywords: "hooks git haken" },
      { id: "submodules", group: "views", label: t("appSearch.actionTabSubmodules"), icon: <FolderGit2 className="size-3.5" />, keywords: "submodule untermodul" },
      { id: "tools", group: "views", label: t("appSearch.actionTabTools"), icon: <Wrench className="size-3.5" />, keywords: "tools werkzeuge skripte scripts" },
    ];

    const repoActions: ActionItem[] = activePath
      ? [
          {
            id: "action:push",
            group: "git",
            label: t("appSearch.actionPush"),
            icon: <ArrowUpToLine className="size-3.5" />,
            keywords: "push upload hochladen senden",
            onSelect: () => {
              setOpen(false);
              void runRemoteOp("push", activePath, (opId) =>
                invoke<string>("git_push", { path: activePath, setUpstream: false, forceMode: null, tagsMode: null, atomic: false, noVerify: false, dryRun: false, opId }),
              )
                .then(() => toast.success(t("toolbar.actionSuccess")))
                .catch((e) => reportRemoteError(e));
            },
          },
          {
            id: "action:pull",
            group: "git",
            label: t("appSearch.actionPull"),
            icon: <ArrowDownToLine className="size-3.5" />,
            keywords: "pull download sync holen aktualisieren",
            onSelect: () => {
              setOpen(false);
              void runRemoteOp("pull", activePath, (opId) =>
                invoke<string>("git_pull", { path: activePath, strategy: "merge", opId }),
              )
                .then(() => toast.success(t("toolbar.actionSuccess")))
                .catch((e) => reportRemoteError(e));
            },
          },
          {
            id: "action:fetch",
            group: "git",
            label: t("appSearch.actionFetch"),
            icon: <CloudDownload className="size-3.5" />,
            keywords: "fetch remote abrufen",
            onSelect: () => {
              setOpen(false);
              void runRemoteOp("fetch", activePath, (opId) =>
                invoke<string>("git_fetch", { path: activePath, pruneBranches: true, pruneTags: false, opId }),
              )
                .then(() => toast.success(t("toolbar.actionSuccess")))
                .catch((e) => reportRemoteError(e));
            },
          },
          {
            id: "action:focus-commit-panel",
            group: "git",
            label: t("appSearch.actionFocusCommitPanel"),
            icon: <GitCommitHorizontal className="size-3.5" />,
            keywords: "commit message nachricht schreiben focus fokus eingabe compose",
            onSelect: () => {
              setOpen(false);
              setSidebarTab("commit");
              window.setTimeout(() => {
                const el = document.querySelector<HTMLInputElement>(
                  "[data-commit-message-input]",
                );
                el?.focus();
              }, 60);
            },
          },
          {
            id: "action:stage-all",
            group: "git",
            label: t("appSearch.actionStageAll"),
            icon: <Plus className="size-3.5" />,
            keywords: "stage all alles stagen index hinzufuegen hinzufügen add",
            onSelect: () => {
              setOpen(false);
              const paths = (statusEntries ?? [])
                .filter((entry) => entry.unstaged || entry.untracked)
                .map((entry) => entry.path);
              if (paths.length === 0) return;
              void useRepoStore
                .getState()
                .stageFiles(activePath, paths)
                .catch((e) => toastError(String(e)));
            },
          },
          {
            id: "action:unstage-all",
            group: "git",
            label: t("appSearch.actionUnstageAll"),
            icon: <Minus className="size-3.5" />,
            keywords: "unstage all alles unstagen index entfernen reset",
            onSelect: () => {
              setOpen(false);
              const paths = (statusEntries ?? [])
                .filter((entry) => entry.staged)
                .map((entry) => entry.path);
              if (paths.length === 0) return;
              void useRepoStore
                .getState()
                .unstageFiles(activePath, paths)
                .catch((e) => toastError(String(e)));
            },
          },
          {
            id: "action:stash-push",
            group: "git",
            label: t("appSearch.actionStashPush"),
            icon: <Archive className="size-3.5" />,
            keywords: "stash push save wegpacken sichern aenderungen änderungen",
            onSelect: () => {
              setOpen(false);
              setStashCreateOpen(true);
            },
          },
          ...(stashCount > 0
            ? [
                {
                  id: "action:stash-pop",
                  group: "git" as const,
                  label: t("appSearch.actionStashPop"),
                  icon: <Archive className="size-3.5" />,
                  keywords: "stash pop apply zurueckholen zurückholen wiederherstellen",
                  onSelect: () => {
                    setOpen(false);
                    void useRepoStore
                      .getState()
                      .stashPop(activePath, 0)
                      .then((out) =>
                        toast.success(out.trim() || t("toolbar.actionSuccess")),
                      )
                      .catch((e) => toastError(String(e)));
                  },
                },
              ]
            : []),
          {
            id: "action:new-branch",
            group: "git",
            label: t("appSearch.actionNewBranch"),
            icon: <GitBranch className="size-3.5" />,
            keywords: "branch new create neuer zweig anlegen",
            onSelect: () => {
              setOpen(false);
              setNewBranchOpen(true);
            },
          },
          ...(selectedCommit || headCommit
            ? [
                {
                  id: "action:new-tag",
                  group: "git" as const,
                  label: selectedCommit
                    ? t("appSearch.actionNewTagOnCommit", {
                        hash: selectedCommit.shortHash,
                      })
                    : t("appSearch.actionNewTag"),
                  icon: <Tag className="size-3.5" />,
                  keywords: "tag new create version release markieren",
                  onSelect: () => {
                    setOpen(false);
                    const target = selectedCommit
                      ? {
                          hash: selectedCommit.hash,
                          shortHash: selectedCommit.shortHash,
                        }
                      : headCommit
                        ? { hash: headCommit.hash, shortHash: headCommit.short_hash }
                        : null;
                    if (target) setTagTarget(target);
                  },
                },
              ]
            : []),
          ...branches
            .filter((b) => !b.is_remote && !b.is_current)
            .slice(0, MERGE_SUGGESTION_LIMIT)
            .map((b) => ({
              id: `action:merge:${b.name}`,
              group: "git" as const,
              label: t("appSearch.actionMergeBranch", {
                source: b.name,
                target: currentBranch,
              }),
              icon: <GitMerge className="size-3.5" />,
              keywords: `merge zusammenfuehren zusammenführen ${b.name}`,
              onSelect: () => {
                setOpen(false);
                setMergeSource(b.name);
              },
            })),
          {
            id: "action:rebase",
            group: "git",
            label: t("appSearch.actionRebase"),
            icon: <Layers className="size-3.5" />,
            keywords: "rebase onto upstream umbasieren",
            onSelect: () => {
              setOpen(false);
              setRebaseOpen(true);
            },
          },
          {
            id: "action:rebase-interactive",
            group: "git",
            label: t("appSearch.actionRebaseInteractive"),
            icon: <ListOrdered className="size-3.5" />,
            keywords: "rebase interactive interaktiv todo squash fixup reword drop",
            onSelect: () => {
              setOpen(false);
              setRebaseEditorOpen(true);
            },
          },
          ...(selectedCommit
            ? [
                {
                  id: "action:cherry-pick",
                  group: "git" as const,
                  label: t("appSearch.actionCherryPick", {
                    hash: selectedCommit.shortHash,
                  }),
                  icon: <GitBranchPlus className="size-3.5" />,
                  keywords: "cherry pick uebernehmen übernehmen commit",
                  onSelect: () => {
                    setOpen(false);
                    void useRepoStore
                      .getState()
                      .cherryPick(activePath, [selectedCommit.hash])
                      .then((out) =>
                        toast.success(out.trim() || t("toolbar.actionSuccess")),
                      )
                      .catch((e) => toastError(String(e)));
                  },
                },
                {
                  id: "action:checkout-commit",
                  group: "git" as const,
                  label: t("appSearch.actionCheckoutCommit", {
                    hash: selectedCommit.shortHash,
                  }),
                  icon: <GitCommitHorizontal className="size-3.5" />,
                  keywords: "checkout detached commit auschecken",
                  onSelect: () => {
                    setOpen(false);
                    void checkoutBranch(activePath, selectedCommit.hash)
                      .then(() => toast.success(t("toolbar.actionSuccess")))
                      .catch((e) => toastError(String(e)));
                  },
                },
                {
                  id: "action:copy-hash",
                  group: "git" as const,
                  label: t("appSearch.actionCopyHash", {
                    hash: selectedCommit.shortHash,
                  }),
                  icon: <ClipboardCopy className="size-3.5" />,
                  keywords: "copy hash kopieren sha commit id",
                  onSelect: () => {
                    setOpen(false);
                    void navigator.clipboard
                      ?.writeText(selectedCommit.hash)
                      .then(() => toast.success(t("toolbar.actionSuccess")))
                      .catch(() => {});
                  },
                },
              ]
            : []),
          ...(selectedCommit || headCommit
            ? [
                {
                  id: "action:reset",
                  group: "git" as const,
                  label: t("appSearch.actionReset"),
                  icon: <Undo2 className="size-3.5" />,
                  keywords: "reset soft mixed hard zuruecksetzen zurücksetzen",
                  onSelect: () => {
                    setOpen(false);
                    setResetTarget(
                      selectedCommit?.hash ?? headCommit?.hash ?? null,
                    );
                  },
                },
              ]
            : []),
          {
            id: "action:undo-last",
            group: "git",
            label: t("appSearch.actionUndoLast"),
            icon: <Undo2 className="size-3.5" />,
            keywords: "undo rueckgaengig rückgängig revert last operation reflog",
            onSelect: () => {
              setOpen(false);
              setUndoOpen(true);
            },
          },
          {
            id: "action:reflog",
            group: "views",
            label: t("appSearch.actionReflog"),
            icon: <FileClock className="size-3.5" />,
            keywords: "reflog history undo reset verlauf",
            onSelect: () => {
              setOpen(false);
              openReflogView(activePath);
            },
          },
          {
            id: "action:command-log",
            group: "views",
            label: t("appSearch.actionCommandLog"),
            icon: <ScrollText className="size-3.5" />,
            keywords: "log kommando command transparenz transparency git",
            onSelect: () => {
              setOpen(false);
              openCommandLog();
            },
          },
          {
            id: "action:blame",
            group: "views",
            label: t("appSearch.actionBlame"),
            icon: <Search className="size-3.5" />,
            keywords: "blame annotate schuld zeilen autor line author",
            onSelect: () => {
              setOpen(false);
              openBlameEditor(activePath);
            },
          },
          ...tabActions.map((ta) => ({
            id: `action:tab:${ta.id}`,
            group: ta.group,
            label: ta.label,
            icon: ta.icon,
            keywords: ta.keywords,
            onSelect: () => {
              setOpen(false);
              setSidebarTab(ta.id);
            },
          })),
          {
            id: "action:pr-create",
            group: "prci",
            label: t("appSearch.actionPrCreate"),
            icon: <GitPullRequest className="size-3.5" />,
            keywords: "pr pull request create erstellen neu merge request",
            onSelect: () => {
              setOpen(false);
              requestPrCreate(activePath, currentBranch);
            },
          },
          {
            id: "action:terminal",
            group: "views",
            label: t("appSearch.actionToggleTerminal"),
            icon: <Code2 className="size-3.5" />,
            keywords: "terminal console konsole shell",
            onSelect: () => {
              setOpen(false);
              toggleTerminal(activePath);
            },
          },
          {
            id: "action:diff-layout",
            group: "views",
            label: t("appSearch.actionToggleDiffLayout"),
            icon: <Columns2 className="size-3.5" />,
            keywords: "diff inline side by side nebeneinander split unified layout",
            onSelect: () => {
              setOpen(false);
              useCommitPrefs.getState().toggleDiffLayoutMode();
            },
          },
          {
            id: "action:merge-editor-mode",
            group: "views",
            label: t("appSearch.actionToggleMergeEditor"),
            icon: <GitMerge className="size-3.5" />,
            keywords: "merge conflict editor 2way 3way wege konflikt",
            onSelect: () => {
              setOpen(false);
              useCommitPrefs.getState().toggleMergeEditorMode();
            },
          },
          {
            id: "action:reveal",
            group: "repo",
            label: t("appSearch.actionRevealFolder"),
            icon: <FolderOpen className="size-3.5" />,
            keywords: "folder reveal open finder explorer ordner dateien",
            onSelect: () => {
              setOpen(false);
              void invoke("reveal_repo_folder", { path: activePath }).catch((e) => toastError(String(e)));
            },
          },
          {
            id: "action:open-ide",
            group: "repo",
            label: t("appSearch.actionOpenIde"),
            icon: <Code2 className="size-3.5" />,
            keywords: "ide editor vscode oeffnen öffnen code",
            onSelect: () => {
              setOpen(false);
              const ide = ideLaunchCommand.trim();
              if (!ide) {
                toastError(t("toolbar.noIdeCommand"));
                return;
              }
              void invoke("open_repo_in_ide", { path: activePath, ideLaunch: ide }).catch((e) =>
                toastError(String(e)),
              );
            },
          },
          {
            id: "action:open-terminal-external",
            group: "repo",
            label: t("appSearch.actionOpenExternalTerminal"),
            icon: <Terminal className="size-3.5" />,
            keywords: "terminal external extern shell konsole oeffnen öffnen",
            onSelect: () => {
              setOpen(false);
              void invoke("open_repo_terminal", {
                path: activePath,
                useGitBash: repoTerminalKind === "git_bash",
              }).catch((e) => toastError(String(e)));
            },
          },
          // Repo-declared tool actions (.l8git/tools.json)
          ...(tools ?? [])
            .filter((tool) => tool.available)
            .flatMap((tool) =>
              tool.actions.map((action) => ({
                id: `tool:${tool.name}:${action.label}`,
                group: "repo" as const,
                label: action.label,
                icon: <Wrench className="size-3.5" />,
                keywords: `tool ${tool.name} ${action.label} ${action.run}`,
                onSelect: () => {
                  setOpen(false);
                  if (!activePath) return;
                  if (action.confirm) {
                    setPendingTool({ label: action.label, run: action.run });
                  } else {
                    openTerminalTab(activePath, action.label, action.run);
                  }
                },
              })),
            ),
        ]
      : [];

    const globalActions: ActionItem[] = [
      {
        id: "action:open-repo",
        group: "repo",
        label: t("appSearch.actionOpenRepo"),
        icon: <FolderGit2 className="size-3.5" />,
        keywords: "open repository folder hinzufuegen hinzufügen oeffnen öffnen add",
        onSelect: () => {
          setOpen(false);
          void pickRepo();
        },
      },
      {
        id: "action:clone-repo",
        group: "repo",
        label: t("appSearch.actionCloneRepo"),
        icon: <Download className="size-3.5" />,
        keywords: "clone klonen git url remote herunterladen",
        onSelect: () => {
          setOpen(false);
          setCloneOpen(true);
        },
      },
      {
        id: "action:init-repo",
        group: "repo",
        label: t("appSearch.actionInitRepo"),
        icon: <FolderPlus className="size-3.5" />,
        keywords: "init initialisieren neues repository anlegen create new",
        onSelect: () => {
          setOpen(false);
          setInitOpen(true);
        },
      },
      ...openPaths
        .filter((p) => p !== activePath)
        .slice(0, REPO_SWITCH_LIMIT)
        .map((p) => ({
          id: `action:switch-repo:${p}`,
          group: "repo" as const,
          label: t("appSearch.actionSwitchRepo", { name: repoLabel(p) }),
          icon: <FolderGit2 className="size-3.5" />,
          keywords: `repo switch wechseln open ${repoLabel(p)} ${p}`,
          onSelect: () => {
            setOpen(false);
            setActiveRepo(p);
          },
        })),
      {
        id: "action:dashboard",
        group: "views",
        label: t("appSearch.actionDashboard"),
        icon: <LayoutDashboard className="size-3.5" />,
        keywords: "dashboard uebersicht übersicht start home",
        onSelect: () => {
          setOpen(false);
          void router.navigate({ to: "/dashboard" });
        },
      },
      {
        id: "action:agents",
        group: "views",
        label: t("appSearch.actionAgents"),
        icon: <Bot className="size-3.5" />,
        keywords: "agents ai ki assistent chat",
        onSelect: () => {
          setOpen(false);
          void router.navigate({
            to: "/agents",
            search: { path: activePath ?? undefined },
          });
        },
      },
      {
        id: "action:changelog",
        group: "views",
        label: t("appSearch.actionChangelog"),
        icon: <Sparkles className="size-3.5" />,
        keywords: "changelog release notes neuerungen versionen",
        onSelect: () => {
          setOpen(false);
          void router.navigate({ to: "/changelog" });
        },
      },
      {
        id: "action:shortcuts",
        group: "views",
        label: t("appSearch.actionShortcuts"),
        icon: <Keyboard className="size-3.5" />,
        keywords: "shortcuts hotkeys tastenkuerzel tastenkürzel keyboard tasten",
        onSelect: () => {
          setOpen(false);
          void router.navigate({ to: "/info" });
        },
      },
      {
        id: "action:settings",
        group: "views",
        label: t("appSearch.actionSettings"),
        icon: <Settings className="size-3.5" />,
        keywords: "settings preferences config einstellungen optionen",
        onSelect: () => {
          setOpen(false);
          void router.navigate({ to: "/settings" });
        },
      },
      {
        id: "action:onboarding-tour",
        group: "views",
        label: t("appSearch.actionRestartTour"),
        icon: <Compass className="size-3.5" />,
        keywords: "tour onboarding einfuehrung einführung guide hilfe help",
        onSelect: () => {
          setOpen(false);
          startOnboardingTour();
        },
      },
    ];

    return [...repoActions, ...globalActions];
  }, [
    activePath,
    branches,
    checkoutBranch,
    currentBranch,
    headCommit,
    ideLaunchCommand,
    openBlameEditor,
    openCommandLog,
    openPaths,
    openReflogView,
    openTerminalTab,
    pickRepo,
    repoTerminalKind,
    requestPrCreate,
    router,
    selectedCommit,
    setActiveRepo,
    setSidebarTab,
    stashCount,
    statusEntries,
    t,
    toggleTerminal,
    tools,
  ]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allActions;
    return allActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.keywords?.includes(q),
    );
  }, [allActions, query]);

  const actionGroups = useMemo(() => {
    const order: ActionGroupId[] = ["git", "views", "repo", "prci"];
    const headings: Record<ActionGroupId, string> = {
      git: t("appSearch.groupGit"),
      views: t("appSearch.groupViews"),
      repo: t("appSearch.groupRepo"),
      prci: t("appSearch.groupPrCi"),
    };
    const previewOnly = query.trim().length === 0;
    return order
      .map((id) => {
        const items = filteredActions.filter((a) => a.group === id);
        return {
          id,
          heading: headings[id],
          items: previewOnly ? items.slice(0, PREVIEW_ACTIONS_PER_GROUP) : items,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [filteredActions, query, t]);

  // ─── primary action ───────────────────────────────────────────────────────

  const onFocusBranch = useCallback(
    (branchName: string) => {
      if (!activePath) return;
      const branch = branches.find((b) => b.name === branchName);
      if (!branch) return;
      focusCommitFromBranchTip(activePath, branch.tip);
      setOpen(false);
    },
    [activePath, branches, focusCommitFromBranchTip],
  );

  const onFocusTag = useCallback(
    (tagName: string) => {
      if (!activePath) return;
      const tag = tags.find((x) => x.name === tagName);
      if (!tag) return;
      focusCommitFromBranchTip(activePath, tag.commit);
      setOpen(false);
    },
    [activePath, tags, focusCommitFromBranchTip],
  );

  const onFocusCommit = useCallback(
    (hash: string) => {
      if (!activePath) return;
      requestCommitHistoryFocus(activePath, hash);
      setOpen(false);
    },
    [activePath, requestCommitHistoryFocus],
  );

  // ─── secondary action (⌘↵) ───────────────────────────────────────────────

  const performCheckout = useCallback(
    (branchName: string) => {
      if (!activePath) return;
      const branch = branches.find((b) => b.name === branchName);
      if (!branch || branch.is_current) return;
      setOpen(false);
      void (async () => {
        try {
          if (branch.is_remote) {
            const local =
              branch.name.slice(branch.name.indexOf("/") + 1) || "branch";
            await checkoutBranch(activePath, local, { fromRemote: branch.name });
          } else {
            await checkoutBranch(activePath, branch.name);
          }
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [activePath, branches, checkoutBranch],
  );

  const handleCommandKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const isModifier = IS_MAC ? e.metaKey : e.ctrlKey;
      if (!isModifier || e.key !== "Enter") return;
      e.preventDefault();
      const val = highlightedValue.current;
      if (val.startsWith("branch:")) {
        performCheckout(val.slice("branch:".length));
      }
    },
    [performCheckout],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const hasResults =
    filteredBranches.length > 0 ||
    filteredTags.length > 0 ||
    filteredCommits.length > 0 ||
    filteredActions.length > 0;

  const queryTrimmed = query.trim();
  const showDeepSearchHint =
    queryTrimmed.length > 0 && filteredCommits.length === 0 && totalCommits > 0;

  return (
    <>
      {/* ── Trigger button ───────────────────────────────────────────────────── */}
      <Button
        type="button"
        variant="subtle"
        size="icon-sm"
        onClick={() => setOpen(true)}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        aria-label={t("appSearch.triggerPlaceholder")}
        title={`${t("appSearch.triggerPlaceholder")} (${MOD_KEY}K)`}
      >
        <Search strokeWidth={2} />
      </Button>

      {/* ── Command dialog ───────────────────────────────────────────────────── */}
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t("appSearch.dialogTitle")}
        description={t("appSearch.dialogDescription")}
      >
        <Command
          shouldFilter={false}
          onValueChange={(v) => {
            highlightedValue.current = v;
          }}
          onKeyDown={handleCommandKeyDown}
        >
          <CommandInput
            placeholder={t("appSearch.inputPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!hasResults && (
              <CommandEmpty>{t("appSearch.empty")}</CommandEmpty>
            )}

            {actionGroups.map((group, idx) => (
              <Fragment key={group.id}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.items.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      onSelect={a.onSelect}
                    >
                      {a.icon}
                      <span className="min-w-0 flex-1 truncate text-xs">{a.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}

            {actionGroups.length > 0 &&
              (filteredBranches.length > 0 || filteredTags.length > 0 || filteredCommits.length > 0) && (
                <CommandSeparator />
              )}

            {filteredBranches.length > 0 && (
              <CommandGroup heading={t("appSearch.groupBranches")}>
                {filteredBranches.map((b) => (
                  <CommandItem
                    key={`branch:${b.name}`}
                    value={`branch:${b.name}`}
                    onSelect={() => onFocusBranch(b.name)}
                  >
                    <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {b.name}
                    </span>
                    {b.is_current ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t("appSearch.badgeCurrent")}
                      </span>
                    ) : b.is_remote ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t("appSearch.badgeRemote")}
                      </span>
                    ) : (
                      <CommandShortcut title={t("appSearch.checkoutShortcutTitle", { mod: MOD_KEY })}>
                        {MOD_KEY}↵
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {filteredBranches.length > 0 && filteredTags.length > 0 && (
              <CommandSeparator />
            )}

            {filteredTags.length > 0 && (
              <CommandGroup heading={t("appSearch.groupTags")}>
                {filteredTags.map((tag) => (
                  <CommandItem
                    key={`tag:${tag.name}`}
                    value={`tag:${tag.name}`}
                    onSelect={() => onFocusTag(tag.name)}
                  >
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {tag.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {tag.commit.slice(0, 7)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(filteredBranches.length > 0 || filteredTags.length > 0) &&
              filteredCommits.length > 0 && <CommandSeparator />}

            {filteredCommits.length > 0 && (
              <CommandGroup heading={t("appSearch.groupCommits")}>
                {filteredCommits.map((c) => (
                  <CommandItem
                    key={`commit:${c.hash}`}
                    value={`commit:${c.hash}`}
                    onSelect={() => onFocusCommit(c.hash)}
                  >
                    <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {c.short_hash}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {c.subject}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          {/* Footer */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground/60">
            <span>
              <kbd className="font-sans">↵</kbd> {t("appSearch.footerJumpHistory")}
            </span>
            <span>
              <kbd className="font-sans">{MOD_KEY}↵</kbd> {t("appSearch.footerCheckout")}
            </span>
            {stagedCount + unstagedCount > 0 && (
              <span className="text-muted-foreground/50">
                {t("appSearch.footerChanges", {
                  staged: stagedCount,
                  unstaged: unstagedCount,
                })}
              </span>
            )}
            {showDeepSearchHint && (
              <span className="ml-auto text-muted-foreground/50">
                {t("appSearch.deepSearchHint")}
              </span>
            )}
          </div>
        </Command>
      </CommandDialog>

      {/* Each dialog enters the tree on its first open and stays, so closing
          still plays its exit animation. `fallback={null}` matches what a
          closed dialog renders anyway. */}
      <Suspense fallback={null}>
        {activePath ? (
          <>
            {rebaseUsed ? (
              <RebaseDialog
                open={rebaseOpen}
                onClose={() => setRebaseOpen(false)}
                path={activePath}
              />
            ) : null}
            {undoUsed ? (
              <UndoConfirmDialog
                open={undoOpen}
                path={activePath}
                onClose={() => setUndoOpen(false)}
              />
            ) : null}
            {newBranchUsed ? (
              <NewBranchDialog
                open={newBranchOpen}
                onClose={() => setNewBranchOpen(false)}
                path={activePath}
                branches={branches}
              />
            ) : null}
            {stashCreateUsed ? (
              <StashCreateDialog
                open={stashCreateOpen}
                onClose={() => setStashCreateOpen(false)}
                path={activePath}
              />
            ) : null}
            {mergeSource ? (
              <MergeDialog
                open
                onClose={() => setMergeSource(null)}
                path={activePath}
                sourceBranch={mergeSource}
              />
            ) : null}
            {tagTarget ? (
              <CommitTagDialog
                open
                onClose={() => setTagTarget(null)}
                path={activePath}
                commitHash={tagTarget.hash}
                shortHash={tagTarget.shortHash}
              />
            ) : null}
            {resetTarget ? (
              <ResetDialog
                open
                onClose={() => setResetTarget(null)}
                path={activePath}
                commitHash={resetTarget}
              />
            ) : null}
            {rebaseEditorOpen ? (
              <RebaseInteractiveEditor
                open
                onClose={() => setRebaseEditorOpen(false)}
                path={activePath}
              />
            ) : null}
          </>
        ) : null}

      </Suspense>

      <RepoSourceDialogs
        cloneOpen={cloneOpen}
        initOpen={initOpen}
        onCloseClone={() => setCloneOpen(false)}
        onCloseInit={() => setInitOpen(false)}
      />

      {/* Confirm gate for destructive tool actions launched from the palette */}
      <AlertDialog
        open={!!pendingTool}
        onOpenChange={(next) => {
          if (!next) setPendingTool(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tools.confirmTitle", { label: pendingTool?.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              {t("tools.confirmDesc", { run: pendingTool?.run ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (activePath && pendingTool) {
                  openTerminalTab(activePath, pendingTool.label, pendingTool.run);
                }
                setPendingTool(null);
              }}
            >
              {t("tools.run")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
