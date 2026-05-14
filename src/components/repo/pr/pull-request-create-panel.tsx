import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  GitBranch,
  GitPullRequest,
  Plus,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import type { Branch, PullRequest } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

const SHELL_LAYOUT_ID = "pr-create-shell";
const SHELL_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

function titleFromBranch(branch: string) {
  return branch
    .replace(/^origin\//, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickDefaultBase(branches: Branch[]): string {
  const preferred = ["main", "master", "develop", "trunk"];
  for (const name of preferred) {
    const remote = branches.find((b) => b.is_remote && b.name === `origin/${name}`);
    if (remote) return remote.name;
    const local = branches.find((b) => !b.is_remote && b.name === name);
    if (local) return local.name;
  }
  return branches.find((b) => b.is_remote)?.name ?? "";
}

function BranchDropdown({
  value,
  onChange,
  branches,
  label,
  disabled,
  ariaLabel,
  excludeName,
}: {
  value: string;
  onChange: (v: string) => void;
  branches: Branch[];
  label: string;
  disabled?: boolean;
  ariaLabel: string;
  excludeName?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = branches.filter(
      (b) =>
        b.name !== excludeName &&
        (q === "" || b.name.toLowerCase().includes(q)),
    );
    return {
      local: visible.filter((b) => !b.is_remote),
      remote: visible.filter((b) => b.is_remote),
    };
  }, [branches, query, excludeName]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div className="grid gap-1" ref={containerRef}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left font-mono text-xs shadow-xs transition-colors",
            "hover:bg-muted aria-expanded:bg-muted disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate">
            {value ? (
              value
            ) : (
              <span className="font-sans italic text-muted-foreground">
                {t("pr.pickBranch")}
              </span>
            )}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 opacity-60"
          >
            <ChevronDown className="h-3 w-3" />
          </motion.span>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
              style={{ transformOrigin: "top center" }}
            >
              <div className="flex items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
                <Search className="h-3 w-3 opacity-50" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("pr.branchFilterPlaceholder")}
                  autoFocus
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="max-h-64 overflow-auto py-1">
                {grouped.local.length === 0 && grouped.remote.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                    {t("pr.noMatchingBranches")}
                  </div>
                ) : (
                  <>
                    <BranchSection
                      title={t("branchMenu.sectionLocal")}
                      branches={grouped.local}
                      value={value}
                      onPick={pick}
                    />
                    <BranchSection
                      title={t("branchMenu.sectionRemote")}
                      branches={grouped.remote}
                      value={value}
                      onPick={pick}
                    />
                  </>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BranchSection({
  title,
  branches,
  value,
  onPick,
}: {
  title: string;
  branches: Branch[];
  value: string;
  onPick: (name: string) => void;
}) {
  const { t } = useTranslation();
  if (branches.length === 0) return null;
  return (
    <div className="px-1 pb-1">
      <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </div>
      {branches.map((b) => {
        const active = value === b.name;
        return (
          <button
            key={`${title}-${b.name}`}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onPick(b.name)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs transition-colors hover:bg-muted",
              active && "bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background",
              )}
            >
              {active ? <Check className="h-2.5 w-2.5" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            {b.is_current ? (
              <span className="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-semibold uppercase tracking-wider text-primary">
                {t("pr.branchCurrentBadge")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PullRequestCreateTrigger({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.button
      layoutId={SHELL_LAYOUT_ID}
      transition={SHELL_TRANSITION}
      type="button"
      onClick={onOpen}
      className="flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-transparent bg-transparent px-2.5 text-[0.8rem] font-medium text-foreground/80 shadow-none transition-colors hover:bg-muted hover:text-foreground"
    >
      <motion.span
        layout="position"
        className="inline-flex items-center gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{t("pr.createNewButton")}</span>
      </motion.span>
    </motion.button>
  );
}

export function PullRequestCreatePanel({
  path,
  branches,
  currentBranch,
  initialHead,
  onClose,
  onCreated,
}: {
  path: string;
  branches: Branch[];
  currentBranch: string;
  initialHead?: string;
  onClose: () => void;
  onCreated?: (pr: PullRequest) => void;
}) {
  const { t } = useTranslation();
  const defaultBase = useMemo(() => pickDefaultBase(branches), [branches]);
  const initialHeadValue = (initialHead || currentBranch).trim();
  const [head, setHead] = useState(initialHeadValue);
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState(() => titleFromBranch(initialHeadValue));
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!head && currentBranch) setHead(currentBranch);
  }, [head, currentBranch]);

  useEffect(() => {
    if (!base && defaultBase) setBase(defaultBase);
  }, [base, defaultBase]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const titleValue = title.trim();
    if (!titleValue) {
      toastError(t("pr.titleRequiredToast"));
      return;
    }
    if (!head.trim()) {
      toastError(t("pr.pickCompareToast"));
      return;
    }
    if (!base.trim()) {
      toastError(t("pr.pickBaseToast"));
      return;
    }
    if (head.trim() === base.trim()) {
      toastError(t("pr.branchesDistinctToast"));
      return;
    }
    setBusy(true);
    try {
      const pr = await invoke<PullRequest>("pr_create", {
        path,
        title: titleValue,
        body,
        head: head.trim(),
        base: base.trim(),
        draft,
      });
      toast.success(t("pr.createdToast", { number: pr.number }));
      onCreated?.(pr);
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      layoutId={SHELL_LAYOUT_ID}
      transition={SHELL_TRANSITION}
      className="mx-3 mt-3 overflow-hidden rounded-xl border border-primary/30 bg-card shadow-lg ring-1 ring-primary/10"
    >
      <motion.form
        onSubmit={(e) => void submit(e)}
        initial={{ opacity: 0, y: -4 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { delay: 0.12, duration: 0.22, ease: "easeOut" },
        }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        className="flex flex-col gap-3 p-3"
      >
        <header className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <GitPullRequest className="h-4 w-4 text-primary" />
            {t("pr.createTitle")}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("pr.closeAria")}
          >
            <X />
          </Button>
        </header>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <BranchDropdown
            label={t("pr.compareLabel")}
            ariaLabel={t("pr.chooseCompareAria")}
            value={head}
            onChange={setHead}
            branches={branches}
            disabled={busy}
            excludeName={base}
          />
          <div className="hidden pb-2 text-center text-xs text-muted-foreground sm:block">
            →
          </div>
          <BranchDropdown
            label={t("pr.baseLabel")}
            ariaLabel={t("pr.chooseBaseAria")}
            value={base}
            onChange={setBase}
            branches={branches}
            disabled={busy}
            excludeName={head}
          />
        </div>

        <div className="grid gap-1">
          <Label
            htmlFor="pr-create-title"
            className="text-xs text-muted-foreground"
          >
            {t("pr.titleLabel")}
          </Label>
          <Input
            id="pr-create-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
            required
            disabled={busy}
          />
        </div>

        <div className="grid gap-1">
          <Label
            htmlFor="pr-create-body"
            className="text-xs text-muted-foreground"
          >
            {t("pr.descriptionLabel")}
          </Label>
          <Textarea
            id="pr-create-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            spellCheck
            placeholder={t("pr.bodyPlaceholder")}
            disabled={busy}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
              disabled={busy}
            />
            {t("pr.draftLabel")}
          </label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismiss}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("pr.createSubmitBusy") : t("pr.submit")}
            </Button>
          </div>
        </div>
      </motion.form>
    </motion.div>
  );
}
