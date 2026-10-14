import { useNavigate } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, CheckCircle2, CircleDot, Lock, MessageSquare, Star, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PrGlyph } from "@/components/repo/pr/pr-glyph";
import { formatRelative } from "@/lib/format";
import type { CheckState, HubPr, HubProviderId, HubRepo } from "@/lib/hub/types";
import { cn } from "@/lib/utils";

import { langColor } from "./hub-viz";

export type HubView = "home" | "inbox" | "prs" | "reviews" | "starred" | "repos" | "repo";

export function useHubNav() {
  const navigate = useNavigate();
  return (view: HubView, repo?: string) => void navigate({ to: "/hub", search: { view, repo } });
}

export function openExternal(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank", "noopener"));
}

export function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function UserAvatar({ src, login, size = 20, className }: { src: string | null | undefined; login: string; size?: number; className?: string }) {
  return src ? (
    <img
      src={src.includes("githubusercontent") ? `${src}${src.includes("?") ? "&" : "?"}s=${size * 2}` : src}
      alt=""
      title={login}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 rounded-full bg-muted object-cover ring-1 ring-border/60", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      title={login}
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] uppercase text-muted-foreground ring-1 ring-border/60", className)}
      style={{ width: size, height: size }}
    >
      {login.slice(0, 1)}
    </span>
  );
}

export function ProviderMark({ provider, className }: { provider: HubProviderId; className?: string }) {
  const paths: Record<HubProviderId, string> = {
    github:
      "M12 2C6.48 2 2 6.48 2 12.02c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10.02 10.02 0 0 0 22 12.02C22 6.48 17.52 2 12 2z",
    gitlab: "m21.94 13.11-1.02-3.15-2.07-6.38a.5.5 0 0 0-.96.01L15.8 9.15H8.21L6.1 3.59a.5.5 0 0 0-.96-.01L3.07 9.97l-1.02 3.15a1.01 1.01 0 0 0 .37 1.13L12 21l9.58-6.75a1 1 0 0 0 .36-1.14",
    bitbucket: "M2.65 3a.65.65 0 0 0-.65.75l2.73 16.6c.07.42.43.73.86.73h13.1c.32 0 .59-.23.64-.54L22 3.75a.65.65 0 0 0-.65-.75zm11.5 12H9.97l-1.13-5.9h6.33z",
    gitea: "M4 6h16l-2 12H6z",
  };
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-3.5", className)} aria-hidden>
      <path d={paths[provider]} />
    </svg>
  );
}

export function CheckIcon({ state, className }: { state: CheckState; className?: string }) {
  const { t } = useTranslation();
  const cls = cn("size-3.5 shrink-0", className);
  if (state === "success") return <CheckCircle2 className={cn(cls, "text-git-added")} aria-label={t("hub.checks.success")} />;
  if (state === "failure") return <XCircle className={cn(cls, "text-destructive")} aria-label={t("hub.checks.failure")} />;
  if (state === "pending") return <CircleDot className={cn(cls, "text-git-modified")} aria-label={t("hub.checks.pending")} />;
  return <span className={cn(cls, "inline-grid place-items-center text-muted-foreground/50")}>·</span>;
}

export function Panel({ title, count, action, children, className }: { title: ReactNode; count?: number | null; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)} style={{ contain: "content" }}>
      <header className="flex h-10 items-center justify-between gap-2 border-b border-border/60 px-5">
        <h3 className="flex items-center gap-2 text-[13px] font-medium">
          {title}
          {count != null && <span className="font-mono text-xs text-muted-foreground">{count}</span>}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-4 text-[13px] text-muted-foreground">{children}</p>;
}

export function ErrorRow({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const msg = error.includes("__PROVIDER_RATE_LIMIT__") ? t("hub.rateLimited") : error === "unsupported" ? t("hub.providerUnsupported") : error.replace(/^Error:\s*/, "");
  return (
    <div className="flex items-start gap-2 px-5 py-4 text-[13px] text-destructive">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{msg}</span>
      {onRetry && (
        <button type="button" className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div aria-busy className="divide-y divide-border/40">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 px-5">
          <span className="size-3.5 rounded-full bg-muted" />
          <span className="h-2.5 rounded bg-muted" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function PrRow({ pr, showRepo, actions }: { pr: HubPr; showRepo?: boolean; actions?: ReactNode }) {
  const { t } = useTranslation();
  const nav = useHubNav();
  const glyphState = pr.draft && pr.state === "open" ? "draft" : pr.state;
  return (
    <div className="group flex min-h-11 items-center gap-3 px-5 py-2 text-[13px] transition-colors hover:bg-muted/40">
      <span
        className={cn(
          "shrink-0",
          glyphState === "open" && "text-git-added",
          glyphState === "merged" && "text-[var(--chart-2)]",
          glyphState === "closed" && "text-destructive",
          glyphState === "draft" && "text-muted-foreground",
        )}
      >
        <PrGlyph state={glyphState} />
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openExternal(pr.url)} className="block max-w-full truncate text-left hover:underline">
          {pr.title}
        </button>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {showRepo && (
            <button type="button" className="truncate font-mono hover:text-foreground" onClick={() => nav("repo", pr.repo)}>
              {pr.repo}
            </button>
          )}
          <span className="font-mono">#{pr.number}</span>
          <span className="shrink-0">· {formatRelative(pr.updatedAt)}</span>
          {pr.review === "approved" && <span className="shrink-0 text-git-added">· {t("hub.review.approved")}</span>}
          {pr.review === "changes" && <span className="shrink-0 text-destructive">· {t("hub.review.changes")}</span>}
        </span>
      </div>
      {pr.additions != null && (
        <span className="hidden shrink-0 font-mono text-xs sm:inline">
          <span className="text-git-added">+{pr.additions}</span> <span className="text-destructive">−{pr.deletions}</span>
        </span>
      )}
      {!!pr.comments && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3" />
          {pr.comments}
        </span>
      )}
      <CheckIcon state={pr.checks} />
      {actions}
      {pr.author && <UserAvatar src={pr.author.avatarUrl} login={pr.author.login} />}
    </div>
  );
}

export function RepoRow({ repo, onOpen }: { repo: HubRepo; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40">
      <UserAvatar src={repo.ownerAvatar} login={repo.owner} size={28} className="rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[13px]">
          <span className="truncate font-medium">{repo.fullName}</span>
          {repo.private && <Lock className="size-3 shrink-0 text-muted-foreground" />}
        </span>
        {repo.description && <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{repo.description}</span>}
        <span className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          {repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: langColor(repo.language, 0) }} />
              {repo.language.name}
            </span>
          )}
          {repo.stars != null && (
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {compact(repo.stars)}
            </span>
          )}
          <span>{formatRelative(repo.updatedAt)}</span>
        </span>
      </span>
    </button>
  );
}
