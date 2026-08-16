import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useOnboardingPrefs } from "@/lib/onboarding-prefs";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

const CARD_WIDTH = 320;
const SPOTLIGHT_PADDING = 8;
const VIEWPORT_MARGIN = 12;

type StepId = "commit" | "history" | "palette" | "undo" | "panels";

type StepDef = {
  id: StepId;
  tab?: SidebarTab;
  anchor: (labels: AnchorLabels) => HTMLElement | null;
};

type AnchorLabels = {
  commitTab: string;
  historyTab: string;
  paletteTrigger: string;
  undoButton: string;
};

function attrEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function tabByLabel(label: string): HTMLElement | null {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
  return (
    tabs.find(
      (el) =>
        el.textContent?.trim() === label ||
        el.getAttribute("title")?.trim() === label,
    ) ?? null
  );
}

const STEPS: StepDef[] = [
  {
    id: "commit",
    tab: "commit",
    anchor: (l) => tabByLabel(l.commitTab),
  },
  {
    id: "history",
    tab: "history",
    anchor: (l) => tabByLabel(l.historyTab),
  },
  {
    id: "palette",
    anchor: (l) =>
      document.querySelector<HTMLElement>(
        `[aria-label="${attrEscape(l.paletteTrigger)}"]`,
      ),
  },
  {
    id: "undo",
    anchor: (l) =>
      document.querySelector<HTMLElement>(`[title="${attrEscape(l.undoButton)}"]`),
  },
  {
    id: "panels",
    anchor: () => document.querySelector<HTMLElement>("aside"),
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function readRect(el: HTMLElement): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function cardPosition(rect: Rect | null): { top: number; left: number } | null {
  if (!rect) return null;
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const top =
    spaceBelow > 220
      ? rect.top + rect.height + SPOTLIGHT_PADDING + 8
      : Math.max(VIEWPORT_MARGIN, rect.top - 220);
  const preferredLeft =
    rect.left + rect.width + SPOTLIGHT_PADDING + 8 + CARD_WIDTH < window.innerWidth
      ? rect.left + rect.width + SPOTLIGHT_PADDING + 8
      : rect.left;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, preferredLeft),
    window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN,
  );
  return { top: Math.min(top, window.innerHeight - 200), left };
}

export function OnboardingTour() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const tourActive = useOnboardingPrefs((s) => s.tourActive);
  const tourDone = useOnboardingPrefs((s) => s.tourDone);
  const tourRunId = useOnboardingPrefs((s) => s.tourRunId);
  const startTour = useOnboardingPrefs((s) => s.startTour);
  const finishTour = useOnboardingPrefs((s) => s.finishTour);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [tourRunId]);

  useEffect(() => {
    if (!activePath || tourDone || tourActive) return;
    const timer = setTimeout(() => {
      if (!useOnboardingPrefs.getState().tourDone) startTour();
    }, 900);
    return () => clearTimeout(timer);
  }, [activePath, tourDone, tourActive, startTour]);

  const step = STEPS[index];

  useEffect(() => {
    if (!tourActive || !step?.tab) return;
    setSidebarTab(step.tab);
  }, [tourActive, step, setSidebarTab]);

  useEffect(() => {
    if (!tourActive || !step) return;
    const labels: AnchorLabels = {
      commitTab: t("sidebar.tabCommit"),
      historyTab: t("sidebar.tabHistory"),
      paletteTrigger: t("appSearch.triggerPlaceholder"),
      undoButton: t("undo.buttonTitle"),
    };
    const measure = () => {
      const el = step.anchor(labels);
      setRect(el ? readRect(el) : null);
    };
    measure();
    const retry = setTimeout(measure, 260);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(retry);
      window.removeEventListener("resize", measure);
    };
  }, [tourActive, step, t]);

  const close = useCallback(() => {
    setRect(null);
    finishTour();
  }, [finishTour]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= STEPS.length - 1) {
        finishTour();
        return i;
      }
      return i + 1;
    });
  }, [finishTour]);

  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourActive, close, next]);

  if (!tourActive || !step || typeof document === "undefined") return null;

  const position = cardPosition(rect);
  const isLast = index === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70 transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/55" />
      )}

      <div className="absolute inset-0" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("tour.ariaLabel")}
        className={cn(
          "absolute w-[320px] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl",
          !position && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={position ? { top: position.top, left: position.left } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("tour.stepCounter", { current: index + 1, total: STEPS.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("tour.close")}
            title={t("tour.close")}
            onClick={close}
          >
            <X />
          </Button>
        </div>

        <p className="mt-1 text-sm font-semibold">{t(`tour.${step.id}Title`)}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t(`tour.${step.id}Body`)}
        </p>

        {step.id === "palette" && (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Kbd>{MOD_KEY}</Kbd>
            <Kbd>K</Kbd>
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            {t("tour.dontShowAgain")}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              aria-label={t("tour.back")}
              title={t("tour.back")}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" size="sm" className="gap-1" onClick={next}>
              {isLast ? t("tour.finish") : t("tour.next")}
              {!isLast && <ChevronRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
