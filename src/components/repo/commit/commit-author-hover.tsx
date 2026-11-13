import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatDate, formatRelative } from "@/lib/format";
import { useGravatarUrl } from "@/lib/gravatar";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { m, type Variants } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CommitAvatar } from "./commit-avatar";
import { parseGitDate, type CoAuthor } from "@/lib/commit-trailers";

export { parseCoAuthors, type CoAuthor } from "@/lib/commit-trailers";

type Stats = { files: number; additions: number; deletions: number; committer: string | null; committedAt: string | null };
type InspectPayload = { header: string; files: { additions: number; deletions: number }[] };

const statsCache = new Map<string, Promise<Stats>>();

function loadStats(path: string, hash: string): Promise<Stats> {
  const key = `${path}\0${hash}`;
  let p = statsCache.get(key);
  if (!p) {
    p = invoke<InspectPayload>("repo_commit_inspect", { path, commit: hash }).then((out) => {
      const field = (name: string) => out.header.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1].trim() ?? null;
      return {
        files: out.files.length,
        additions: out.files.reduce((s, f) => s + f.additions, 0),
        deletions: out.files.reduce((s, f) => s + f.deletions, 0),
        committer: field("Commit")?.replace(/\s*<[^>]*>$/, "") ?? null,
        committedAt: parseGitDate(field("CommitDate") ?? ""),
      };
    });
    p.catch(() => statsCache.delete(key));
    statsCache.set(key, p);
  }
  return p;
}

const list: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 4, filter: "blur(2px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <m.div variants={item} className="flex items-center justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{children}</span>
    </m.div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <span className={cn("inline-block h-3 animate-pulse rounded bg-muted align-middle", className)} />;
}

export function AuthorAvatarStack({
  url,
  fallbackUrl,
  name,
  coAuthor,
  size,
}: {
  url: string | null | undefined;
  fallbackUrl?: string | null;
  name: string;
  coAuthor?: CoAuthor;
  size: "xs" | "md";
}) {
  const coUrl = useGravatarUrl(coAuthor?.email ?? "");
  return (
    <span className="relative inline-flex shrink-0">
      <CommitAvatar url={url} fallbackUrl={fallbackUrl} name={name} size={size} />
      {coAuthor ? (
        <span
          className={cn(
            "absolute -right-1 -bottom-1 overflow-hidden rounded-full ring-2 ring-card",
            size === "xs" ? "size-2.5 [&_[data-slot=avatar]]:size-2.5 [&_[data-slot=avatar-fallback]]:text-[0.3rem]" : "size-4 [&_[data-slot=avatar]]:size-4 [&_[data-slot=avatar-fallback]]:text-[0.45rem]",
          )}
          title={coAuthor.name}
        >
          <CommitAvatar url={coUrl} name={coAuthor.name} size="xs" />
        </span>
      ) : null}
    </span>
  );
}

function HoverBody({
  path,
  hash,
  shortHash,
  author,
  email,
  authorAvatar,
  date,
  coAuthors,
  branches,
}: {
  path: string;
  hash: string;
  shortHash: string;
  author: string;
  email?: string;
  authorAvatar?: string | null;
  date: string;
  coAuthors: CoAuthor[];
  branches: readonly string[];
}) {
  const { t } = useTranslation();
  const gravatarUrl = useGravatarUrl(email ?? "");
  const remoteAvatar = authorAvatar?.trim() || undefined;
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadStats(path, hash).then(
      (s) => live && setStats(s),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [path, hash]);

  const committedAt = stats?.committedAt ?? date;
  const showCommitter = stats?.committer && stats.committer !== author;

  return (
    <m.div variants={list} initial="hidden" animate="visible" className="text-xs">
      <m.div variants={item} className="flex items-center gap-3 px-3 pt-3 pb-2.5">
        <AuthorAvatarStack url={remoteAvatar ?? gravatarUrl} fallbackUrl={remoteAvatar ? (gravatarUrl ?? null) : undefined} name={author} coAuthor={coAuthors[0]} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{author}</div>
          <div className="truncate text-muted-foreground">
            {coAuthors.length
              ? t("commitHover.coAuthoredWith", { names: coAuthors.map((a) => a.name).join(", ") })
              : email}
          </div>
        </div>
      </m.div>
      <div className="border-t border-border/60 px-3 py-2">
        <Row label={t("commitHover.commit")}>
          <span className="font-mono">{shortHash}</span>
        </Row>
        <Row label={t("commitHover.changed")}>
          {stats ? (
            <m.span initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="tabular-nums">
              {t("commitHover.files", { count: stats.files })}{" "}
              <span className="text-git-added">+{stats.additions.toLocaleString()}</span>{" "}
              <span className="text-git-removed">−{stats.deletions.toLocaleString()}</span>
            </m.span>
          ) : failed ? (
            "–"
          ) : (
            <Skeleton className="w-24" />
          )}
        </Row>
        <Row label={t("commitHover.committed")}>
          <time dateTime={committedAt} title={formatDate(committedAt)}>
            {showCommitter ? `${formatRelative(committedAt)} · ${stats.committer}` : formatRelative(committedAt)}
          </time>
        </Row>
        {branches.length ? <Row label={t("commitHover.branch")}>{branches.join(", ")}</Row> : null}
      </div>
    </m.div>
  );
}

export function CommitAuthorHover({
  children,
  ...body
}: Parameters<typeof HoverBody>[0] & { children: ReactNode }) {
  return (
    <HoverCard openDelay={350} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 overflow-hidden p-0 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <HoverBody {...body} />
      </HoverCardContent>
    </HoverCard>
  );
}
