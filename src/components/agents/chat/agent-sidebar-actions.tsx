import { Blocks, Link2, MessageSquarePlus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AgentSidebarActions({
  query,
  onQueryChange,
  capabilityStudioOpen,
  onNewThread,
  onOpenCapabilities,
  onOpenImport,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  capabilityStudioOpen: boolean;
  onNewThread: () => void;
  onOpenCapabilities?: () => void;
  onOpenImport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <nav className="space-y-1 px-3 pb-3" aria-label={t("header.agents")}>
      <button
        type="button"
        onClick={onNewThread}
        className="group flex h-9 w-full items-center gap-2.5 rounded-[10px] border border-[var(--agents-line)] bg-background/65 px-2.5 text-left text-xs font-medium shadow-xs outline-none transition-[background-color,transform,box-shadow] duration-200 hover:bg-background hover:shadow-sm active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquarePlus className="agents-accent-text size-3.5" />
        <span className="flex-1">{t("agentChat.newConversation")}</span>
        <kbd className="rounded-md bg-foreground/[0.055] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          ⌘N
        </kbd>
      </button>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-9 rounded-[10px] border-transparent bg-transparent pl-8 text-[11px] shadow-none transition-colors hover:bg-foreground/[0.03] focus-visible:border-[var(--agents-line)] focus-visible:bg-background/55"
        />
      </div>

      <button
        type="button"
        onClick={onOpenCapabilities}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          capabilityStudioOpen
            ? "agents-active-rail bg-foreground/[0.055] pl-3.5 text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
        )}
      >
        <Blocks className={cn("size-3.5", capabilityStudioOpen && "agents-accent-text")} />
        <span className="flex-1">{t("agentCapabilities.title")}</span>
      </button>

      <button
        type="button"
        onClick={onOpenImport}
        className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Link2 className="size-3.5" />
        <span className="flex-1">{t("agentChat.importConversation")}</span>
      </button>
    </nav>
  );
}
