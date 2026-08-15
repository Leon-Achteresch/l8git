import { Button } from "@/components/ui/button";
import {
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
  CloudDownload,
  Code2,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  History,
  Layers,
  ListChecks,
  ListOrdered,
  Search,
  Settings,
  Tag,
  Webhook,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "@tanstack/react-router";
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
import { RebaseDialog } from "@/components/repo/rebase/rebase-dialog";
import { RebaseInteractiveEditor } from "@/components/repo/rebase/rebase-interactive-editor";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useRepoToolsStore } from "@/lib/repo-tools-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { usePickRepo } from "@/lib/use-pick-repo";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

type ActionItem = {
  id: string;
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

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((IS_MAC ? e.metaKey : e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { activePath, repo } = useRepoStore(
    useShallow((s) => ({
      activePath: s.activePath,
      repo: s.activePath ? s.repos[s.activePath] : null,
    })),
  );
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const focusCommitFromBranchTip = useUiStore(
    (s) => s.focusCommitFromBranchTip,
  );
  const requestCommitHistoryFocus = useUiStore(
    (s) => s.requestCommitHistoryFocus,
  );
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const toggleTerminal = useTerminalStore((s) => s.toggleVisible);
  const openTerminalTab = useTerminalStore((s) => s.openTab);
  const tools = useRepoToolsStore((s) =>
    activePath ? s.toolsByPath[activePath] : undefined,
  );
  const loadTools = useRepoToolsStore((s) => s.loadTools);
  const [pendingTool, setPendingTool] = useState<{
    label: string;
    run: string;
  } | null>(null);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [rebaseEditorOpen, setRebaseEditorOpen] = useState(false);
  const totalCommits = repo?.commits.length ?? 0;

  // Refresh the repo's tool manifest whenever the palette opens.
  useEffect(() => {
    if (open && activePath) void loadTools(activePath);
  }, [open, activePath, loadTools]);

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

  // Actions — always shown, filtered by query
  const allActions = useMemo((): ActionItem[] => {
    const tabActions: { id: SidebarTab; label: string; icon: React.ReactNode; keywords: string }[] = [
      { id: "commit", label: t("appSearch.actionTabCommit"), icon: <GitCommitHorizontal className="size-3.5" />, keywords: "commit stage" },
      { id: "history", label: t("appSearch.actionTabHistory"), icon: <History className="size-3.5" />, keywords: "history log" },
      { id: "pr", label: t("appSearch.actionTabPr"), icon: <GitBranch className="size-3.5" />, keywords: "pr pull request" },
      { id: "ci", label: t("appSearch.actionTabCi"), icon: <ListChecks className="size-3.5" />, keywords: "ci pipeline" },
      { id: "stash", label: t("appSearch.actionTabStash"), icon: <Archive className="size-3.5" />, keywords: "stash" },
      { id: "worktrees", label: t("appSearch.actionTabWorktrees"), icon: <GitFork className="size-3.5" />, keywords: "worktree" },
      { id: "hooks", label: t("appSearch.actionTabHooks"), icon: <Webhook className="size-3.5" />, keywords: "hooks git" },
      { id: "submodules", label: t("appSearch.actionTabSubmodules"), icon: <FolderGit2 className="size-3.5" />, keywords: "submodule" },
    ];

    const items: ActionItem[] = [
      ...(activePath ? [
        {
          id: "action:push",
          label: t("appSearch.actionPush"),
          icon: <ArrowUpToLine className="size-3.5" />,
          keywords: "push upload",
          onSelect: () => {
            setOpen(false);
            void invoke<string>("git_push", { path: activePath, setUpstream: false, forceMode: null, tagsMode: null, atomic: false, noVerify: false, dryRun: false })
              .then(() => toast.success(t("toolbar.actionSuccess")))
              .catch((e) => toastError(String(e)));
          },
        },
        {
          id: "action:pull",
          label: t("appSearch.actionPull"),
          icon: <ArrowDownToLine className="size-3.5" />,
          keywords: "pull download sync",
          onSelect: () => {
            setOpen(false);
            void invoke<string>("git_pull", { path: activePath, strategy: "merge" })
              .then(() => toast.success(t("toolbar.actionSuccess")))
              .catch((e) => toastError(String(e)));
          },
        },
        {
          id: "action:fetch",
          label: t("appSearch.actionFetch"),
          icon: <CloudDownload className="size-3.5" />,
          keywords: "fetch remote",
          onSelect: () => {
            setOpen(false);
            void invoke<string>("git_fetch", { path: activePath, pruneBranches: true, pruneTags: false })
              .then(() => toast.success(t("toolbar.actionSuccess")))
              .catch((e) => toastError(String(e)));
          },
        },
        {
          id: "action:rebase",
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
          label: t("appSearch.actionRebaseInteractive"),
          icon: <ListOrdered className="size-3.5" />,
          keywords: "rebase interactive interaktiv todo squash fixup reword drop",
          onSelect: () => {
            setOpen(false);
            setRebaseEditorOpen(true);
          },
        },
        {
          id: "action:new-branch",
          label: t("appSearch.actionNewBranch"),
          icon: <GitBranch className="size-3.5" />,
          keywords: "branch new create",
          onSelect: () => {
            setOpen(false);
            setSidebarTab("commit");
          },
        },
        ...tabActions.map((ta) => ({
          id: `action:tab:${ta.id}`,
          label: ta.label,
          icon: ta.icon,
          keywords: ta.keywords,
          onSelect: () => {
            setOpen(false);
            setSidebarTab(ta.id);
          },
        })),
        {
          id: "action:terminal",
          label: t("appSearch.actionToggleTerminal"),
          icon: <Code2 className="size-3.5" />,
          keywords: "terminal console",
          onSelect: () => {
            setOpen(false);
            toggleTerminal(activePath);
          },
        },
        {
          id: "action:reveal",
          label: t("toolbar.revealLabel"),
          icon: <FolderOpen className="size-3.5" />,
          keywords: "folder reveal open finder explorer",
          onSelect: () => {
            setOpen(false);
            void invoke("reveal_repo_folder", { path: activePath }).catch((e) => toastError(String(e)));
          },
        },
        // Repo-declared tool actions (.l8git/tools.json)
        ...(tools ?? [])
          .filter((tool) => tool.available)
          .flatMap((tool) =>
            tool.actions.map((action) => ({
              id: `tool:${tool.name}:${action.label}`,
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
      ] : []),
      {
        id: "action:open-repo",
        label: t("appSearch.actionOpenRepo"),
        icon: <FolderGit2 className="size-3.5" />,
        keywords: "open repository folder",
        onSelect: () => {
          setOpen(false);
          void pickRepo();
        },
      },
      {
        id: "action:settings",
        label: t("appSearch.actionSettings"),
        icon: <Settings className="size-3.5" />,
        keywords: "settings preferences config",
        onSelect: () => {
          setOpen(false);
          void router.navigate({ to: "/settings" });
        },
      },
    ];

    return items;
  }, [activePath, t, setSidebarTab, toggleTerminal, openTerminalTab, tools, pickRepo, router]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allActions.slice(0, 6);
    return allActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.keywords?.includes(q),
    );
  }, [allActions, query]);

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

            {filteredActions.length > 0 && (
              <CommandGroup heading={t("appSearch.groupActions")}>
                {filteredActions.map((a) => (
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
            )}

            {filteredActions.length > 0 &&
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
            {showDeepSearchHint && (
              <span className="ml-auto text-muted-foreground/50">
                {t("appSearch.deepSearchHint")}
              </span>
            )}
          </div>
        </Command>
      </CommandDialog>

      {activePath ? (
        <>
          <RebaseDialog
            open={rebaseOpen}
            onClose={() => setRebaseOpen(false)}
            path={activePath}
          />
          {rebaseEditorOpen ? (
            <RebaseInteractiveEditor
              open
              onClose={() => setRebaseEditorOpen(false)}
              path={activePath}
            />
          ) : null}
        </>
      ) : null}

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
