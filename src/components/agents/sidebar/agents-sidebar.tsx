import { useRef, useState } from "react";
import { Check, ChevronRight, Circle, CircleAlert, Clock3, Folder, GitPullRequest, List, MoreHorizontal, PanelLeft, Pin, Search, SquarePen } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "motion/react";

import { AppLogo } from "@/components/brand/app-logo";
import { Collapse, Rotate } from "@/components/motion/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type SidebarThread = {
  id: string;
  title: string;
  group: string;
  age: string;
  status: "done" | "running" | "idle" | "review" | "failed";
  prs?: number;
  pinned?: boolean;
};

const control = "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const navigation = "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

function ThreadStatus({ status }: { status: SidebarThread["status"] }) {
  const icon = {
    done: <Check className="size-2.5" strokeWidth={3} />,
    running: <Clock3 className="size-3.5" />,
    idle: <Circle className="size-3.5" />,
    review: <span className="size-3.5 rounded-full border-2 border-current bg-linear-to-r from-current from-50% to-transparent to-50%" />,
    failed: <CircleAlert className="size-3.5" />,
  }[status];
  return <span role="img" aria-label={status} title={status} className={cn("flex size-3.5 shrink-0 items-center justify-center", status === "done" ? "rounded-full bg-green-600 text-sidebar" : status === "review" ? "text-yellow-500" : status === "failed" ? "text-orange-500" : "text-muted-foreground")}>{icon}</span>;
}

export function AgentsSidebar({ threads, selectedId, onSelect, onNewThread }: {
  threads: SidebarThread[];
  selectedId: string | null;
  onSelect: (thread: SidebarThread) => void;
  onNewThread: () => void;
}) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [closedGroups, setClosedGroups] = useState<string[]>(["Pinned"]);
  const searchRef = useRef<HTMLInputElement>(null);
  const openSearch = () => {
    setCollapsed(false);
    setSearching(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const toggleGroup = (group: string) => setClosedGroups(current => current.includes(group) ? current.filter(item => item !== group) : [...current, group]);
  const filtered = threads.filter(thread => `${thread.title} ${thread.id} ${thread.group}`.toLowerCase().includes(query.toLowerCase()));
  const groups = ["Pinned", ...new Set(threads.map(thread => thread.group))];

  return (
    <m.aside
      aria-label="Agents sidebar"
      animate={{ width: collapsed ? 48 : 264 }}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className={cn("flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground", collapsed ? "max-w-[80vw]" : "max-w-[80vw]")}
    >
      <div className={cn("flex h-16 shrink-0 items-center gap-1 px-3", collapsed && "justify-center px-1")}>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <m.div
              key="brand"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={SPRING_SWAP}
              className="mr-auto flex min-w-0 items-center"
            >
              <AppLogo className="size-7" />
            </m.div>
          )}
        </AnimatePresence>
        {!collapsed && <button type="button" className={control} aria-label="Search threads" onClick={openSearch}><Search className="size-4" /></button>}
        <button type="button" className={control} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}><PanelLeft className="size-4" /></button>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <m.div
            key="body"
            initial={reduce ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <nav aria-label="Agents navigation" className="space-y-0.5 px-1.5">
              <button type="button" className={cn(navigation, !selectedId && "bg-sidebar-accent")} onClick={onNewThread}><SquarePen className="size-4" />New thread</button>
              <button type="button" className={navigation} onClick={openSearch}><List className="size-4" />Threads</button>
              <DropdownMenu><DropdownMenuTrigger className={navigation}><MoreHorizontal className="size-4" />More</DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => setClosedGroups([])}>Expand all groups</DropdownMenuItem><DropdownMenuItem onSelect={() => setClosedGroups(groups)}>Collapse all groups</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </nav>
            <div className="mb-2 mt-5 flex h-8 shrink-0 items-center px-3.5"><h2 className="mr-auto text-sm font-medium">Threads</h2><button type="button" className={control} aria-label="Filter threads" onClick={openSearch}><Search className="size-3.5" /></button><DropdownMenu><DropdownMenuTrigger className={control} aria-label="Thread options"><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => setClosedGroups([])}>Expand all groups</DropdownMenuItem><DropdownMenuItem onSelect={() => setClosedGroups(groups)}>Collapse all groups</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            <Collapse open={searching}>
              <div className="px-3 pb-2"><input ref={searchRef} aria-label="Search threads" placeholder="Search threads…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setQuery(""); setSearching(false); } }} className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" /></div>
            </Collapse>
            <LayoutGroup>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-5 [scrollbar-width:thin]">
                {groups.map(group => {
                  const items = filtered.filter(thread => group === "Pinned" ? thread.pinned : thread.group === group);
                  if (query && !items.length) return null;
                  const open = Boolean(query) || !closedGroups.includes(group);
                  return <section key={group} className="mb-3"><button type="button" aria-expanded={open} onClick={() => toggleGroup(group)} className="group flex h-9 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">{group === "Pinned" ? <Pin className="size-3.5" /> : <Folder className="size-3.5" />}<span>{group}</span><span className="text-muted-foreground/70">{items.length}</span><Rotate open={open} angle={90} className={cn("size-3", group !== "Pinned" && "ml-auto opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}><ChevronRight className="size-3" /></Rotate></button>
                    <Collapse open={open}>
                      {items.map((thread, index) => (
                        <m.button
                          type="button"
                          key={thread.id}
                          aria-current={selectedId === thread.id ? "true" : undefined}
                          onClick={() => onSelect(thread)}
                          initial={reduce ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...SPRING_PANEL, delay: reduce ? 0 : Math.min(index, 12) * 0.02 }}
                          className={cn("relative mb-0.5 block w-full rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", selectedId === thread.id && "bg-sidebar-accent")}
                        >
                          <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm leading-5" title={thread.title}>{thread.title}</span><ThreadStatus status={thread.status} /></span><span className="mt-0.5 flex items-center gap-1 text-xs leading-4 text-muted-foreground"><span>{thread.id}</span><span>·</span><span>{thread.age}</span>{thread.prs && <><span>·</span><GitPullRequest className={cn("ml-0.5 size-3", thread.status === "idle" ? "text-violet-400" : "text-green-600")} /><span>{thread.prs} PRs</span></>}</span>
                        </m.button>
                      ))}
                    </Collapse>
                  </section>;
                })}
                {filtered.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No threads found.</p>}
              </div>
            </LayoutGroup>
          </m.div>
        )}
      </AnimatePresence>
    </m.aside>
  );
}
