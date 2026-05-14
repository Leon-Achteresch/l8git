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
  GitBranch,
  GitCommitHorizontal,
  Search,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

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
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

export function AppHeaderSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // cmdk tracks which item is highlighted — we mirror it here so the keydown
  // handler can perform the secondary action on the correct item.
  const highlightedValue = useRef<string>("");

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

  // ─── primary action (Enter / single click in sidebar) ───────────────────────

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

  // ─── secondary action (⌘↵ / double click in sidebar) ────────────────────────

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

  // ⌘↵ on the currently highlighted item → secondary action
  const handleCommandKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const isModifier = IS_MAC ? e.metaKey : e.ctrlKey;
      if (!isModifier || e.key !== "Enter") return;
      e.preventDefault();
      const val = highlightedValue.current;
      if (val.startsWith("branch:")) {
        performCheckout(val.slice("branch:".length));
      }
      // tags and commits have no secondary action
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
    filteredCommits.length > 0;

  return (
    <>
      {/* ── Trigger bar ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        className={cn(
          "inline-flex h-[26px] w-full max-w-[460px] items-center gap-2 rounded-lg",
          "border border-border/50 bg-muted/30 px-2.5",
          "text-xs text-muted-foreground transition-colors",
          "cursor-pointer select-none",
          "hover:border-border/70 hover:bg-muted/50",
        )}
      >
        <Search className="size-3.5 shrink-0 opacity-50" strokeWidth={2} />
        <span className="rounded border border-border/40 bg-background/80 px-1.5 py-px text-[10px] font-semibold text-foreground/80">
          gitit
        </span>
        <span className="min-w-0 flex-1 truncate text-left opacity-50">{t("appSearch.triggerPlaceholder")}</span>
        <kbd className="inline-flex shrink-0 items-center gap-px rounded border border-border/50 bg-background/60 px-1.5 py-px font-sans text-[10px] text-muted-foreground">
          {MOD_KEY}K
        </kbd>
      </button>

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

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground/60">
            <span>
              <kbd className="font-sans">↵</kbd> {t("appSearch.footerJumpHistory")}
            </span>
            <span>
              <kbd className="font-sans">{MOD_KEY}↵</kbd> {t("appSearch.footerCheckout")}
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
