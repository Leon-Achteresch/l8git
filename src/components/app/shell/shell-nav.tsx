import { Link, useRouterState } from "@tanstack/react-router";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  CircleHelp,
  Earth,
  GitFork,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkeyBindings } from "@/lib/hotkey-prefs";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";

export type ShellNavVariant =
  | "header"
  | "icons"
  | "segmented"
  | "rail"
  | "list"
  | "status";

type NavEntry = {
  to: "/" | "/dashboard" | "/hub" | "/info" | "/settings";
  label: string;
  icon: LucideIcon;
  active: boolean;
  kbd?: string;
};

function useNavEntries() {
  const { t } = useTranslation();
  const bindings = useHotkeyBindings();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const main: NavEntry[] = [
    { to: "/", label: t("header.repo"), icon: GitFork, active: pathname === "/" },
    { to: "/dashboard", label: t("header.dashboard"), icon: LayoutDashboard, active: pathname.startsWith("/dashboard") },
    { to: "/hub", label: t("header.hub"), icon: Earth, active: pathname.startsWith("/hub") },
  ];
  const utility: NavEntry[] = [
    { to: "/info", label: t("helpCenter.title"), icon: CircleHelp, active: pathname === "/info", kbd: bindings.helpCenter },
    { to: "/settings", label: t("header.settingsAria"), icon: Settings, active: pathname.startsWith("/settings"), kbd: bindings.settings },
  ];
  return { main, utility };
}

const TOOLTIP_SIDE = {
  header: "bottom",
  icons: "bottom",
  segmented: "bottom",
  rail: "right",
  list: "right",
  status: "top",
} as const;

function NavItem({
  entry,
  variant,
  showLabel,
  indicator,
}: {
  entry: NavEntry;
  variant: ShellNavVariant;
  showLabel: boolean;
  indicator: boolean;
}) {
  const { label, icon: Icon, active, kbd } = entry;
  const link = (
    <Link
      to={entry.to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
        (variant === "header" || variant === "icons") &&
          cn(
            "size-8 justify-center rounded-xl",
            showLabel && "xl:w-auto xl:gap-1.5 xl:px-2",
            active
              ? "bg-muted text-foreground shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          ),
        variant === "segmented" &&
          cn(
            "h-7 justify-center gap-1.5 rounded-[10px] px-2 text-xs",
            active
              ? "bg-background text-foreground shadow-xs ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground",
          ),
        variant === "rail" &&
          cn(
            "size-9 justify-center rounded-xl",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          ),
        variant === "list" &&
          cn(
            "h-8 w-full gap-2.5 rounded-lg px-2 text-[0.8125rem]",
            active
              ? "bg-card text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
          ),
        variant === "status" &&
          cn(
            "h-6 gap-1.5 rounded-md px-2 text-[0.6875rem]",
            active
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          ),
      )}
    >
      <Icon
        className={cn("shrink-0", variant === "status" ? "size-3.5" : "size-4")}
        strokeWidth={1.75}
        aria-hidden
      />
      {showLabel && (
        <span
          className={cn(
            "truncate",
            variant === "header" && "hidden text-xs xl:inline",
            variant === "segmented" && "hidden lg:inline",
          )}
        >
          {label}
        </span>
      )}
      {indicator && active && variant === "header" && (
        <span
          aria-hidden
          className="absolute -bottom-[7px] left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-foreground/70"
        />
      )}
      {active && variant === "rail" && (
        <span
          aria-hidden
          className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-foreground"
        />
      )}
    </Link>
  );
  // Visible labels already name the link; tooltips only help icon-only items.
  const labelVisible = showLabel && (variant === "list" || variant === "status");
  if (labelVisible && !kbd) return link;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side={TOOLTIP_SIDE[variant]} sideOffset={8}>
        <span className="inline-flex items-center gap-1.5 font-medium">
          {label}
          {kbd && (
            <Kbd className="h-4 px-1 text-[0.625rem]">{formatForDisplay(kbd)}</Kbd>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Repository / Dashboard / Hub. */
export function MainNav({ variant }: { variant: ShellNavVariant }) {
  const { t } = useTranslation();
  const navLabels = useWorkspacePrefs((s) => s.navLabels);
  const { main } = useNavEntries();
  const showLabel =
    variant === "list" ||
    variant === "status" ||
    (navLabels && (variant === "header" || variant === "segmented"));
  return (
    <nav
      aria-label={t("header.mainNav")}
      className={cn(
        "flex",
        variant === "rail" || variant === "list"
          ? "flex-col items-center gap-1"
          : "items-center gap-0.5",
        variant === "list" && "items-stretch",
        variant === "segmented" && "rounded-xl bg-foreground/[0.045] p-0.5",
      )}
    >
      {main.map((entry) => (
        <NavItem
          key={entry.to}
          entry={entry}
          variant={variant}
          showLabel={showLabel}
          indicator
        />
      ))}
    </nav>
  );
}

/** Help center + settings. */
export function UtilityNav({ variant }: { variant: ShellNavVariant }) {
  const { utility } = useNavEntries();
  return (
    <div
      className={cn(
        "flex",
        variant === "rail" || variant === "list"
          ? "flex-col items-center gap-1"
          : "items-center gap-0.5",
        variant === "list" && "flex-row",
      )}
    >
      {utility.map((entry) => (
        <NavItem
          key={entry.to}
          entry={entry}
          variant={variant === "segmented" || variant === "list" ? "header" : variant}
          showLabel={false}
          indicator={false}
        />
      ))}
    </div>
  );
}
