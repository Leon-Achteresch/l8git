import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes } from "@/lib/media";
import { useMediaPrefs, type ImageDiffMode } from "@/lib/media-prefs";
import { cn } from "@/lib/utils";
import { Columns2, Layers, Loader2, Maximize2, MoveHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SpinIcon } from "@/components/motion/kit";

export type ImageDiffSideStatus =
  | "ready"
  | "empty"
  | "loading"
  | "tooLarge"
  | "error"
  | "lfsMissing";

export type ImageDiffSide = {
  label: string;
  url: string | null;
  byteSize: number | null;
  status: ImageDiffSideStatus;
  message?: string | null;
};

type Dimensions = { width: number; height: number };

function useImageDimensions(url: string | null): Dimensions | null {
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);

  useEffect(() => {
    if (!url) {
      setDimensions(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setDimensions(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return dimensions;
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<Dimensions>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ width: el.clientWidth, height: el.clientHeight });
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function SidePlaceholder({ side }: { side: ImageDiffSide }) {
  const { t } = useTranslation();
  if (side.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinIcon icon={Loader2} className="size-5 text-primary/50" />
      </div>
    );
  }
  const text =
    side.message ??
    (side.status === "empty"
      ? t("media.noContent")
      : side.status === "tooLarge"
        ? t("media.tooLarge", { size: formatBytes(side.byteSize) })
        : side.status === "lfsMissing"
          ? t("lfs.objectNotLocal")
          : t("media.loadFailed"));
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function SideCaption({
  side,
  dimensions,
}: {
  side: ImageDiffSide;
  dimensions: Dimensions | null;
}) {
  const { t } = useTranslation();
  const size = formatBytes(side.byteSize);
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground/80">{side.label}</span>
      {dimensions ? (
        <span className="shrink-0 tabular-nums">
          {t("media.dimensions", {
            width: dimensions.width,
            height: dimensions.height,
          })}
        </span>
      ) : null}
      {size ? <span className="shrink-0 tabular-nums">{size}</span> : null}
    </div>
  );
}

export function ImageDiff({
  before,
  after,
  className,
}: {
  before: ImageDiffSide;
  after: ImageDiffSide;
  className?: string;
}) {
  const { t } = useTranslation();
  const mode = useMediaPrefs((s) => s.imageDiffMode);
  const setMode = useMediaPrefs((s) => s.setImageDiffMode);
  const zoom = useMediaPrefs((s) => s.imageDiffZoom);
  const toggleZoom = useMediaPrefs((s) => s.toggleImageDiffZoom);

  const [swipe, setSwipe] = useState(50);
  const [opacity, setOpacity] = useState(50);

  const beforeDimensions = useImageDimensions(before.url);
  const afterDimensions = useImageDimensions(after.url);

  const stageRef = useRef<HTMLDivElement>(null);
  const box = useElementSize(stageRef);

  const natural = useMemo(() => {
    const width = Math.max(beforeDimensions?.width ?? 0, afterDimensions?.width ?? 0);
    const height = Math.max(beforeDimensions?.height ?? 0, afterDimensions?.height ?? 0);
    return width > 0 && height > 0 ? { width, height } : null;
  }, [beforeDimensions, afterDimensions]);

  const stageStyle = useMemo(() => {
    if (!natural) return undefined;
    if (zoom === "actual") {
      return { width: natural.width, height: natural.height };
    }
    if (box.width <= 0 || box.height <= 0) return undefined;
    const scale = Math.min(box.width / natural.width, box.height / natural.height, 1);
    return { width: natural.width * scale, height: natural.height * scale };
  }, [natural, zoom, box.width, box.height]);

  const anyImage = !!before.url || !!after.url;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => value && setMode(value as ImageDiffMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem
            value="sideBySide"
            aria-label={t("media.modeSideBySide")}
            title={t("media.modeSideBySideTitle")}
          >
            <Columns2 />
            {t("media.modeSideBySide")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="swipe"
            aria-label={t("media.modeSwipe")}
            title={t("media.modeSwipeTitle")}
          >
            <MoveHorizontal />
            {t("media.modeSwipe")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="onion"
            aria-label={t("media.modeOnion")}
            title={t("media.modeOnionTitle")}
          >
            <Layers />
            {t("media.modeOnion")}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={toggleZoom}
          title={zoom === "fit" ? t("media.zoomActualTitle") : t("media.zoomFitTitle")}
        >
          <Maximize2 className="size-3.5" />
          {zoom === "fit" ? t("media.zoomActual") : t("media.zoomFit")}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <SideCaption side={before} dimensions={beforeDimensions} />
          <SideCaption side={after} dimensions={afterDimensions} />
        </div>
      </div>

      {mode === "sideBySide" ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border/60">
          {[before, after].map((side, index) => (
            <div
              key={index === 0 ? "before" : "after"}
              className={cn(
                "flex min-h-0 min-w-0 items-center justify-center p-3",
                zoom === "actual" && "overflow-auto",
              )}
            >
              {side.url ? (
                <img
                  src={side.url}
                  alt={side.label}
                  className={cn(
                    "bg-muted/30 shadow-sm ring-1 ring-border/40",
                    zoom === "fit"
                      ? "max-h-full max-w-full object-contain"
                      : "max-w-none shrink-0",
                  )}
                />
              ) : (
                <SidePlaceholder side={side} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={stageRef}
            className={cn(
              "flex min-h-0 flex-1 items-center justify-center p-3",
              zoom === "actual" && "overflow-auto",
            )}
          >
            {anyImage ? (
              <div
                className="relative shrink-0 bg-muted/30 ring-1 ring-border/40"
                style={stageStyle}
              >
                {before.url ? (
                  <img
                    src={before.url}
                    alt={before.label}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : null}
                {after.url ? (
                  <img
                    src={after.url}
                    alt={after.label}
                    className="absolute inset-0 h-full w-full object-contain"
                    style={
                      mode === "swipe"
                        ? { clipPath: `inset(0 0 0 ${swipe}%)` }
                        : { opacity: opacity / 100 }
                    }
                  />
                ) : null}
                {mode === "swipe" ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 w-px bg-primary/80"
                    style={{ left: `${swipe}%` }}
                  />
                ) : null}
              </div>
            ) : (
              <SidePlaceholder side={after.url ? after : before} />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-border/60 px-4 py-2">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {mode === "swipe" ? t("media.swipeLabel") : t("media.opacityLabel")}
            </span>
            <Slider
              className="max-w-md flex-1"
              min={0}
              max={100}
              step={1}
              value={[mode === "swipe" ? swipe : opacity]}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? (value[0] ?? 0) : value;
                if (mode === "swipe") setSwipe(next);
                else setOpacity(next);
              }}
            />
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {mode === "swipe" ? swipe : opacity}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
