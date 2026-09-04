import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BellOff,
  CheckCheck,
  ExternalLink,
  Inbox as InboxIcon,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { SpinIcon } from "@/components/motion/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type NotificationCenterTab = "all" | "mine" | "review" | "ci" | "agents";

export type NotificationCenterAction = {
  id: string;
  label: string;
  variant?: "primary" | "secondary";
};

export type NotificationBadgeTone = "neutral" | "success" | "danger" | "warning" | "info";

export type NotificationCenterItem = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  tooltip?: string;
  unread?: boolean;
  visual?: ReactNode;
  badges?: { label: string; tone?: NotificationBadgeTone; title?: string }[];
  actions?: NotificationCenterAction[];
  externalUrl?: string;
  externalLabel?: string;
};

export type NotificationCenterGroup = {
  id: string;
  title: string;
  icon?: LucideIcon;
  count: number;
  items: NotificationCenterItem[];
};

export type NotificationCenterTabDef = {
  id: NotificationCenterTab;
  label: string;
  count: number;
};

const BADGE_TONE: Record<NotificationBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const AVATAR_TONES = [
  "bg-primary/10 text-primary",
  "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
] as const;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneFor(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Avatar visual with deterministic tone, mirroring the BoardUI reference. */
export function NotificationAvatar({ name }: { name: string }) {
  return (
    <Avatar size="lg" className="size-10 shrink-0" aria-hidden>
      <AvatarFallback className={cn("text-xs font-semibold", toneFor(name))}>
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Colored status visual for system/agent style notifications. */
export function NotificationStatusVisual({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        className ?? "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function TabLabel({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-medium tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </span>
  );
}

function NotificationCard({
  item,
  index,
  unreadLabel,
  onOpen,
  onAction,
}: {
  item: NotificationCenterItem;
  index: number;
  unreadLabel: string;
  onOpen: (id: string) => void;
  onAction: (id: string, actionId: string) => void;
}) {
  const unread = item.unread === true;
  return (
    <article
      role="button"
      tabIndex={0}
      title={item.tooltip}
      aria-label={unread ? `${item.title} (${unreadLabel})` : item.title}
      onClick={() => onOpen(item.id)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(item.id);
      }}
      style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}
      className={cn(
        "inbox-enter group/item relative flex cursor-pointer gap-3 rounded-xl bg-background px-3 py-3 text-left transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        unread && "bg-primary/[0.04] ring-1 ring-inset ring-primary/20 hover:bg-primary/[0.07]",
      )}
    >
      {item.visual}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className={cn("min-w-0 truncate text-[13px]", unread ? "font-semibold" : "font-medium")}>
            {item.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
              {item.timestamp}
            </span>
            {item.externalUrl ? (
              <button
                type="button"
                title={item.externalLabel}
                aria-label={item.externalLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.externalUrl) void openUrl(item.externalUrl);
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all group-hover/item:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
              >
                <ExternalLink className="size-3" />
              </button>
            ) : null}
            {unread ? (
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={unreadLabel} />
            ) : null}
          </div>
        </div>
        <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        {item.badges && item.badges.length > 0 ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {item.badges.map((badge) => (
              <span
                key={badge.label}
                title={badge.title}
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-medium",
                  BADGE_TONE[badge.tone ?? "neutral"],
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
        {item.actions && item.actions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {item.actions.map((action) => (
              <Button
                key={action.id}
                size="xs"
                variant={action.variant === "primary" ? "default" : "outline"}
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(item.id, action.id);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export interface NotificationCenterProps {
  title: string;
  headline: string;
  tabsLabel: string;
  tabs: NotificationCenterTabDef[];
  activeTab: NotificationCenterTab;
  onTabChange: (tab: NotificationCenterTab) => void;
  groups: NotificationCenterGroup[];
  markAllReadLabel: string;
  onMarkAllRead: () => void;
  markAllReadDisabled?: boolean;
  refreshLabel: string;
  onRefresh: () => void;
  loading?: boolean;
  unreadLabel: string;
  emptyTitle: string;
  emptyHint: string;
  errorBanner?: ReactNode;
  onOpen: (id: string) => void;
  onAction: (id: string, actionId: string) => void;
}

export function NotificationCenter({
  title,
  headline,
  tabsLabel,
  tabs,
  activeTab,
  onTabChange,
  groups,
  markAllReadLabel,
  onMarkAllRead,
  markAllReadDisabled = false,
  refreshLabel,
  onRefresh,
  loading = false,
  unreadLabel,
  emptyTitle,
  emptyHint,
  errorBanner,
  onOpen,
  onAction,
}: NotificationCenterProps) {
  const visibleCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      {/* CSS-driven enter animation: unlike JS-driven opacity tweens it cannot
          strand content invisible (e.g. when reduced motion is requested),
          and the tab key remount replays it on every filter change. */}
      <style>{`@keyframes inbox-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.inbox-enter{animation:inbox-enter .22s cubic-bezier(.22,1,.36,1) both}@media (prefers-reduced-motion:reduce){.inbox-enter{animation:none}}`}</style>
      <section
        aria-label={title}
        className="flex w-full flex-col gap-3 overflow-hidden rounded-2xl bg-card p-4 ring-1 ring-border/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <InboxIcon className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="font-heading text-lg font-semibold leading-tight">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">{headline}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMarkAllRead}
              disabled={markAllReadDisabled}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              {markAllReadLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title={refreshLabel}
              aria-label={refreshLabel}
              disabled={loading}
              onClick={onRefresh}
            >
              <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as NotificationCenterTab)}>
          <TabsList aria-label={tabsLabel} className="w-full">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="min-w-0">
                <TabLabel label={tab.label} count={tab.count} active={activeTab === tab.id} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      {errorBanner}

      <div key={activeTab} className="inbox-enter flex flex-col gap-3">
        {visibleCount === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-6 py-12 text-center ring-1 ring-border/50">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="max-w-72 text-xs leading-relaxed text-muted-foreground">{emptyHint}</p>
          </div>
        ) : (
          groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.id}
                aria-label={group.title}
                className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50"
              >
                <header className="flex items-center gap-2 px-3 py-2.5">
                  {GroupIcon ? (
                    <GroupIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                  <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium">{group.title}</h2>
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {group.count}
                  </span>
                </header>
                <div className="mx-1.5 mb-1.5 flex flex-col gap-1 rounded-xl bg-muted/50 p-1.5">
                  {group.items.map((item, index) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      index={index}
                      unreadLabel={unreadLabel}
                      onOpen={onOpen}
                      onAction={onAction}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
