import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ALL_SIDEBAR_TABS,
  useSidebarPrefs,
  type GridColumns,
  type SidebarSectionId,
  type TabDisplayMode,
  type TabLayout,
  type TabSize,
} from "@/lib/sidebar-prefs";
import {
  GRID_SIDEBAR_MAX_WIDTH,
  GRID_SIDEBAR_MIN_WIDTH,
  useUiStore,
} from "@/lib/ui-store";
import type { SidebarTab } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import {
  Archive,
  Eye,
  EyeOff,
  FolderGit2,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  GripVertical,
  History,
  List,
  ListChecks,
  RotateCcw,
  Tag,
  Webhook,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/* -------------------------------------------------------------------------- */
/*  Tab metadata                                                               */
/* -------------------------------------------------------------------------- */

function useTabMeta(t: ReturnType<typeof useTranslation>["t"]): Record<
  SidebarTab,
  { label: string; icon: React.ReactNode }
> {
  return useMemo(
    () => ({
      commit: {
        label: t("sidebar.tabCommit"),
        icon: <GitCommitHorizontal className="h-4 w-4" />,
      },
      history: {
        label: t("sidebar.tabHistory"),
        icon: <History className="h-4 w-4" />,
      },
      pr: {
        label: t("sidebar.tabPr"),
        icon: <GitPullRequest className="h-4 w-4" />,
      },
      ci: {
        label: t("sidebar.tabCi"),
        icon: <ListChecks className="h-4 w-4" />,
      },
      stash: {
        label: t("sidebar.tabStash"),
        icon: <Archive className="h-4 w-4" />,
      },
      submodules: {
        label: t("sidebar.tabSubmodules"),
        icon: <FolderGit2 className="h-4 w-4" />,
      },
      worktrees: {
        label: t("sidebar.tabWorktrees"),
        icon: <GitFork className="h-4 w-4" />,
      },
      hooks: {
        label: t("sidebar.tabHooks"),
        icon: <Webhook className="h-4 w-4" />,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable tab item                                                          */
/* -------------------------------------------------------------------------- */

interface SortableTabItemProps {
  id: SidebarTab;
  icon: React.ReactNode;
  label: string;
  isHidden: boolean;
  onToggle: () => void;
  overlay?: boolean;
}

function SortableTabItem({
  id,
  icon,
  label,
  isHidden,
  onToggle,
  overlay = false,
}: SortableTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm transition-all select-none",
        isDragging && !overlay && "opacity-30 scale-[0.98]",
        overlay && "shadow-xl opacity-95 ring-2 ring-primary/30 scale-[1.02]",
        isHidden && !overlay && "opacity-50",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground transition-colors focus:outline-none active:cursor-grabbing"
        aria-label="Ziehen zum Neuanordnen"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-muted/50 text-muted-foreground transition-colors shrink-0",
          isHidden && "opacity-40",
        )}
      >
        {icon}
      </span>

      {/* Label */}
      <span
        className={cn(
          "flex-1 font-medium text-foreground",
          isHidden && "text-muted-foreground line-through decoration-muted-foreground/40",
        )}
      >
        {label}
      </span>

      {/* Hidden badge */}
      {isHidden && (
        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ausgeblendet
        </span>
      )}

      {/* Visibility toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          isHidden
            ? "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
        aria-label={isHidden ? "Tab einblenden" : "Tab ausblenden"}
      >
        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Display mode option button                                                 */
/* -------------------------------------------------------------------------- */

interface DisplayOptionProps {
  value: TabDisplayMode;
  current: TabDisplayMode;
  label: string;
  description: string;
  preview: React.ReactNode;
  onClick: (v: TabDisplayMode) => void;
}

function DisplayOption({
  value,
  current,
  label,
  description,
  preview,
  onClick,
}: DisplayOptionProps) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-xl border-2 p-4 text-center transition-all",
        active
          ? "border-primary bg-primary/5 text-foreground shadow-sm"
          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {/* Mini sidebar preview */}
      <div
        className={cn(
          "flex h-14 w-10 flex-col items-stretch gap-1 rounded-md border border-border/60 bg-background p-1.5 shadow-sm transition-colors",
          active && "border-primary/30",
        )}
      >
        {preview}
      </div>
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
      </div>
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

/* Mini sidebar row previews */
const PreviewFull = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} className="flex h-2.5 items-center gap-1 rounded-sm bg-muted/70 px-1">
        <div className="h-1.5 w-1.5 shrink-0 rounded-sm bg-muted-foreground/40" />
        <div className="h-1 flex-1 rounded-sm bg-muted-foreground/25" />
      </div>
    ))}
  </>
);
const PreviewIcons = () => (
  <div className="flex flex-col items-center gap-1">
    {[0, 1, 2].map(i => (
      <div key={i} className="h-2.5 w-2.5 rounded-sm bg-muted/70" />
    ))}
  </div>
);
const PreviewLabels = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} className="flex h-2.5 items-center rounded-sm bg-muted/70 px-1">
        <div className="h-1 w-full rounded-sm bg-muted-foreground/25" />
      </div>
    ))}
  </>
);

/* -------------------------------------------------------------------------- */
/*  Layout option button                                                       */
/* -------------------------------------------------------------------------- */

interface LayoutOptionProps {
  value: TabLayout;
  current: TabLayout;
  label: string;
  description: string;
  preview: React.ReactNode;
  onClick: (v: TabLayout) => void;
}

function LayoutOption({
  value,
  current,
  label,
  description,
  preview,
  onClick,
}: LayoutOptionProps) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-xl border-2 p-4 text-center transition-all",
        active
          ? "border-primary bg-primary/5 text-foreground shadow-sm"
          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "flex h-14 w-16 flex-col items-stretch justify-center gap-1 rounded-md border border-border/60 bg-background p-1.5 shadow-sm transition-colors",
          active && "border-primary/30",
        )}
      >
        {preview}
      </div>
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
      </div>
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

/* Mini layout previews */
const PreviewList = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} className="flex h-2.5 items-center gap-1 rounded-sm bg-muted/70 px-1">
        <div className="h-1.5 w-1.5 shrink-0 rounded-sm bg-muted-foreground/40" />
        <div className="h-1 flex-1 rounded-sm bg-muted-foreground/25" />
      </div>
    ))}
  </>
);
const PreviewGrid = () => (
  <div className="grid grid-cols-2 gap-1">
    {[0, 1, 2, 3, 4, 5].map(i => (
      <div key={i} className="flex h-4 flex-col items-center justify-center gap-0.5 rounded-sm bg-muted/70">
        <div className="h-1.5 w-1.5 rounded-sm bg-muted-foreground/40" />
        <div className="h-0.5 w-3 rounded-sm bg-muted-foreground/25" />
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Main export                                                                */
/* -------------------------------------------------------------------------- */

export function SidebarCustomizeSection() {
  const { t } = useTranslation();
  const tabMeta = useTabMeta(t);

  const tabOrder = useSidebarPrefs(s => s.tabOrder);
  const hiddenTabs = useSidebarPrefs(s => s.hiddenTabs);
  const displayMode = useSidebarPrefs(s => s.displayMode);
  const tabSize = useSidebarPrefs(s => s.tabSize);
  const tabLayout = useSidebarPrefs(s => s.tabLayout);
  const gridColumns = useSidebarPrefs(s => s.gridColumns);
  const showBranchFilter = useSidebarPrefs(s => s.showBranchFilter);
  const defaultOpenSections = useSidebarPrefs(s => s.defaultOpenSections);

  const setTabOrder = useSidebarPrefs(s => s.setTabOrder);
  const toggleTabVisibility = useSidebarPrefs(s => s.toggleTabVisibility);
  const setDisplayMode = useSidebarPrefs(s => s.setDisplayMode);
  const setTabSize = useSidebarPrefs(s => s.setTabSize);
  const setTabLayout = useSidebarPrefs(s => s.setTabLayout);
  const setGridColumns = useSidebarPrefs(s => s.setGridColumns);
  const setShowBranchFilter = useSidebarPrefs(s => s.setShowBranchFilter);
  const setDefaultOpenSections = useSidebarPrefs(s => s.setDefaultOpenSections);
  const resetToDefaults = useSidebarPrefs(s => s.resetToDefaults);

  const gridSidebarWidth = useUiStore(s => s.gridSidebarWidth);
  const setGridSidebarWidth = useUiStore(s => s.setGridSidebarWidth);

  const [activeId, setActiveId] = useState<SidebarTab | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as SidebarTab);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tabOrder.indexOf(active.id as SidebarTab);
    const newIndex = tabOrder.indexOf(over.id as SidebarTab);
    if (oldIndex < 0 || newIndex < 0) return;
    setTabOrder(arrayMove(tabOrder, oldIndex, newIndex));
  }

  const visibleCount = tabOrder.filter(t => !hiddenTabs.includes(t)).length;

  const tabSizeOptions: { value: TabSize; label: string }[] = [
    { value: "compact", label: t("settings.sidebarTabSizeCompact") },
    { value: "normal", label: t("settings.sidebarTabSizeNormal") },
    { value: "large", label: t("settings.sidebarTabSizeLarge") },
  ];

  const sectionOptions: { id: SidebarSectionId; labelKey: string; icon: React.ReactNode }[] = [
    { id: "local", labelKey: "sidebar.local", icon: <GitCommitHorizontal className="h-3.5 w-3.5" /> },
    { id: "remote", labelKey: "sidebar.remote", icon: <GitFork className="h-3.5 w-3.5" /> },
    { id: "tags", labelKey: "sidebar.tags", icon: <Tag className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* ─── Tab Order Card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sidebarTabOrderTitle")}</CardTitle>
          <CardDescription>
            {t("settings.sidebarTabOrderDesc")}
          </CardDescription>
          <CardAction>
            <span className="text-xs text-muted-foreground">
              {visibleCount}/{tabOrder.length} sichtbar
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tabOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {tabOrder.map(tabId => (
                  <SortableTabItem
                    key={tabId}
                    id={tabId}
                    icon={tabMeta[tabId].icon}
                    label={tabMeta[tabId].label}
                    isHidden={hiddenTabs.includes(tabId)}
                    onToggle={() => toggleTabVisibility(tabId)}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 150 }}>
              {activeId ? (
                <SortableTabItem
                  id={activeId}
                  icon={tabMeta[activeId].icon}
                  label={tabMeta[activeId].label}
                  isHidden={hiddenTabs.includes(activeId)}
                  onToggle={() => {}}
                  overlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          <div className="flex items-center justify-between border-t border-border/40 pt-3 mt-3">
            <p className="text-xs text-muted-foreground">
              {t("settings.sidebarDragHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setTabOrder([...ALL_SIDEBAR_TABS])}
            >
              <RotateCcw className="h-3 w-3" />
              {t("settings.sidebarResetOrder")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Display Mode Card ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sidebarDisplayTitle")}</CardTitle>
          <CardDescription>{t("settings.sidebarDisplayDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Display mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">
              {t("settings.sidebarDisplayModeLabel")}
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <DisplayOption
                value="full"
                current={displayMode}
                label={t("settings.sidebarDisplayFull")}
                description={t("settings.sidebarDisplayFullDesc")}
                preview={<PreviewFull />}
                onClick={setDisplayMode}
              />
              <DisplayOption
                value="icons_only"
                current={displayMode}
                label={t("settings.sidebarDisplayIcons")}
                description={t("settings.sidebarDisplayIconsDesc")}
                preview={<PreviewIcons />}
                onClick={setDisplayMode}
              />
              <DisplayOption
                value="labels_only"
                current={displayMode}
                label={t("settings.sidebarDisplayLabels")}
                description={t("settings.sidebarDisplayLabelsDesc")}
                preview={<PreviewLabels />}
                onClick={setDisplayMode}
              />
            </div>
          </div>

          {/* Tab size */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">
              {t("settings.sidebarTabSizeTitle")}
            </Label>
            <div className="flex gap-2">
              {tabSizeOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={tabSize === value ? "default" : "outline"}
                  onClick={() => setTabSize(value)}
                  className={cn(
                    "flex-1 transition-all",
                    tabSize === value &&
                      "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
            {/* Size preview strip */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                Vorschau
              </p>
              <div className="space-y-0.5">
                {[
                  { label: t("sidebar.tabCommit"), icon: <GitCommitHorizontal className="h-4 w-4" /> },
                  { label: t("sidebar.tabHistory"), icon: <History className="h-4 w-4" /> },
                ].map(({ label, icon }) => (
                  <div
                    key={label}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md bg-muted/60 pl-2.5 pr-2 text-[13px] text-muted-foreground",
                      tabSize === "compact" && "h-7",
                      tabSize === "normal" && "h-8",
                      tabSize === "large" && "h-10",
                      displayMode === "icons_only" && "justify-center px-1",
                    )}
                  >
                    {displayMode !== "labels_only" && (
                      <span className="shrink-0">{icon}</span>
                    )}
                    {displayMode !== "icons_only" && (
                      <span className="truncate">{label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tab Layout Card ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sidebarTabLayoutTitle")}</CardTitle>
          <CardDescription>{t("settings.sidebarTabLayoutDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List vs Grid picker */}
          <div className="grid grid-cols-2 gap-3">
            <LayoutOption
              value="list"
              current={tabLayout}
              label={t("settings.sidebarTabLayoutList")}
              description={t("settings.sidebarTabLayoutListDesc")}
              preview={<PreviewList />}
              onClick={setTabLayout}
            />
            <LayoutOption
              value="grid"
              current={tabLayout}
              label={t("settings.sidebarTabLayoutGrid")}
              description={t("settings.sidebarTabLayoutGridDesc")}
              preview={<PreviewGrid />}
              onClick={setTabLayout}
            />
          </div>

          {/* Column count picker — only shown in grid mode */}
          {tabLayout === "grid" && (
            <div className="space-y-4">
              {/* Column count */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("settings.sidebarGridColumns")}
                </p>
                <div className="flex gap-2">
                  {([2, 3, 4] as GridColumns[]).map(n => (
                    <Button
                      key={n}
                      type="button"
                      variant={gridColumns === n ? "default" : "outline"}
                      onClick={() => setGridColumns(n)}
                      className={cn(
                        "flex-1 transition-all",
                        gridColumns === n &&
                          "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                      )}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Grid sidebar width */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("settings.sidebarGridWidth")}
                  </p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {gridSidebarWidth} px
                  </span>
                </div>
                <input
                  type="range"
                  min={GRID_SIDEBAR_MIN_WIDTH}
                  max={GRID_SIDEBAR_MAX_WIDTH}
                  step={4}
                  value={gridSidebarWidth}
                  onChange={e => setGridSidebarWidth(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/60">
                  <span>{GRID_SIDEBAR_MIN_WIDTH} px</span>
                  <span>{GRID_SIDEBAR_MAX_WIDTH} px</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Branch Sections Card ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sidebarBranchSectionsTitle")}</CardTitle>
          <CardDescription>{t("settings.sidebarBranchSectionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Branch filter toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground">
                <List className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm font-medium">{t("settings.sidebarShowBranchFilter")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.sidebarShowBranchFilterHint")}
                </p>
              </div>
            </div>
            <Checkbox
              id="show-branch-filter"
              checked={showBranchFilter}
              onCheckedChange={v => setShowBranchFilter(v === true)}
            />
          </div>

          {/* Default open sections */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("settings.sidebarDefaultOpenSections")}
            </p>
            <div className="space-y-2">
              {sectionOptions.map(({ id, labelKey, icon }) => (
                <div
                  key={id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5 transition-colors",
                    defaultOpenSections.includes(id)
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/10",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{icon}</span>
                    <Label htmlFor={`section-${id}`} className="cursor-pointer text-sm font-medium">
                      {t(labelKey)}
                    </Label>
                  </div>
                  <Checkbox
                    id={`section-${id}`}
                    checked={defaultOpenSections.includes(id)}
                    onCheckedChange={checked => {
                      if (checked) {
                        setDefaultOpenSections([...defaultOpenSections, id]);
                      } else {
                        setDefaultOpenSections(defaultOpenSections.filter(s => s !== id));
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Reset Card ─────────────────────────────────────────────────── */}
      <Card className="border-dashed border-border/60">
        <CardHeader>
          <div>
            <CardTitle className="text-base">{t("settings.sidebarResetTitle")}</CardTitle>
            <CardDescription className="mt-1">{t("settings.sidebarResetDesc")}</CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={resetToDefaults}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("settings.sidebarResetButton")}
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
    </div>
  );
}
