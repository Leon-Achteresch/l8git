import { Copy, Download, LoaderCircle, Maximize2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "@/components/agents/ui/item-context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  barcodeFormat,
  barcodeRenderOptions,
  looksLikeBarcodeJson,
  parseBarcodeSpec,
  type AgentBarcodeItem,
  type AgentBarcodeSpec,
} from "@/lib/agents/barcode-spec";
import { SpinIcon } from "@/components/motion/kit";
import { cn } from "@/lib/utils";

type BwipModule = typeof import("bwip-js/browser");

// bwip-js bringt eigene Fonts mit und ist entsprechend groß — erst laden,
// wenn wirklich ein Barcode im Chat auftaucht.
let bwipPromise: Promise<BwipModule> | null = null;
function loadBwip(): Promise<BwipModule> {
  bwipPromise ??= import("bwip-js/browser");
  return bwipPromise;
}

export interface BarcodeRender {
  svg: string | null;
  error: string | null;
}

export function renderBarcodeSvg(bwip: BwipModule, item: AgentBarcodeItem): BarcodeRender {
  try {
    // Die Optionen entstehen dynamisch aus der Spec; bwip-js prüft sie selbst
    // und meldet ungültige Kombinationen als Fehler.
    const options = barcodeRenderOptions(item) as unknown as Parameters<BwipModule["toSVG"]>[0];
    const svg = bwip.toSVG(options);
    if (!svg.startsWith("<svg")) return { svg: null, error: "Unerwartete Ausgabe des Barcode-Renderers." };
    return { svg, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // bwip-js stellt seinen Meldungen einen Fehlercode voran: "bwipp.xy#123: …".
    return { svg: null, error: message.replace(/^bwipp\.[^:]+:\s*/u, "") };
  }
}

function useBwip(): BwipModule | null {
  const [module, setModule] = useState<BwipModule | null>(null);
  useEffect(() => {
    let active = true;
    void loadBwip().then((loaded) => {
      if (active) setModule(loaded);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return module;
}

function downloadSvg(svg: string, name: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/gu, "-").slice(0, 60) || "barcode"}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function BarcodeCard({
  item,
  bwip,
  onZoom,
}: {
  item: AgentBarcodeItem;
  bwip: BwipModule | null;
  onZoom: (item: AgentBarcodeItem) => void;
}) {
  const { t } = useTranslation();
  const render = useMemo(() => (bwip ? renderBarcodeSvg(bwip, item) : null), [bwip, item]);
  const format = barcodeFormat(item.format);

  return (
    <figure className="ag-barcode min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--ag-text)]">
          {item.label ?? format?.label ?? item.format}
        </span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-[var(--ag-text-3)]">
          {format?.label ?? item.format}
        </span>
      </div>
      <div className="ag-barcode-panel mt-1.5">
        {render?.svg ? (
          <button
            type="button"
            onClick={() => onZoom(item)}
            title={t("agentChat.barcodeZoom")}
            aria-label={t("agentChat.barcodeZoom")}
            className="block w-full cursor-zoom-in"
            // bwip-js erzeugt ausschließlich <svg> und <path>; Klartext wird als
            // Pfad gezeichnet, es gelangt also kein Nutzwert als Markup hinein.
            dangerouslySetInnerHTML={{ __html: render.svg }}
          />
        ) : render?.error ? (
          <p className="px-3 py-6 text-center text-[11px] leading-5 text-destructive">{render.error}</p>
        ) : (
          <div className="flex h-24 items-center justify-center gap-2 text-[11px] text-[var(--ag-text-3)]">
            <SpinIcon icon={LoaderCircle} className="size-3.5" />
            {t("agentChat.barcodeLoading")}
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--ag-text-2)]" title={item.value}>
          {item.value}
        </code>
        <button
          type="button"
          className="ag-pill size-6 shrink-0 justify-center p-0"
          title={t("agentChat.barcodeCopy")}
          aria-label={t("agentChat.barcodeCopy")}
          onClick={() => copyToClipboard(item.value, t("agentChat.barcodeCopied"))}
        >
          <Copy className="size-3" />
        </button>
        {render?.svg ? (
          <>
            <button
              type="button"
              className="ag-pill size-6 shrink-0 justify-center p-0"
              title={t("agentChat.barcodeDownload")}
              aria-label={t("agentChat.barcodeDownload")}
              onClick={() => downloadSvg(render.svg!, item.label ?? item.value)}
            >
              <Download className="size-3" />
            </button>
            <button
              type="button"
              className="ag-pill size-6 shrink-0 justify-center p-0"
              title={t("agentChat.barcodeZoom")}
              aria-label={t("agentChat.barcodeZoom")}
              onClick={() => onZoom(item)}
            >
              <Maximize2 className="size-3" />
            </button>
          </>
        ) : null}
      </figcaption>
      {item.caption ? (
        <p className="ag-faint mt-1 break-words text-[10px] leading-4">{item.caption}</p>
      ) : null}
    </figure>
  );
}

/** Vollbild zum Abscannen: Handscanner brauchen den Code deutlich größer. */
function BarcodeZoom({
  item,
  bwip,
  onClose,
}: {
  item: AgentBarcodeItem | null;
  bwip: BwipModule | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const zoomed = useMemo(
    () => (item ? { ...item, scale: Math.min(10, Math.max(item.scale * 2, 6)), height: item.height ? Math.min(60, item.height * 1.6) : null } : null),
    [item],
  );
  const render = useMemo(() => (bwip && zoomed ? renderBarcodeSvg(bwip, zoomed) : null), [bwip, zoomed]);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(92vw,60rem)]">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">
            {item?.label ?? barcodeFormat(item?.format ?? "")?.label ?? t("agentChat.barcodeZoom")}
          </DialogTitle>
        </DialogHeader>
        <div className="ag-barcode-panel grid max-h-[70vh] place-items-center overflow-auto p-6">
          {render?.svg ? (
            <div className="w-full [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: render.svg }} />
          ) : (
            <p className="px-3 py-6 text-center text-[11px] text-destructive">{render?.error}</p>
          )}
        </div>
        {item ? (
          <p className="break-all text-center font-mono text-[11px] text-muted-foreground">{item.value}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export const AgentBarcode = memo(function AgentBarcode({ spec }: { spec: AgentBarcodeSpec }) {
  const bwip = useBwip();
  const [zoom, setZoom] = useState<AgentBarcodeItem | null>(null);
  const multiple = spec.items.length > 1;

  return (
    <section className="my-3 rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface)] p-3">
      {spec.title ? (
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--ag-text)]">{spec.title}</h4>
      ) : null}
      <div className={cn("grid gap-3", multiple && "sm:grid-cols-2")}>
        {spec.items.map((item, index) => (
          <BarcodeCard key={`${item.format}:${item.value}:${index}`} item={item} bwip={bwip} onZoom={setZoom} />
        ))}
      </div>
      <BarcodeZoom item={zoom} bwip={bwip} onClose={() => setZoom(null)} />
    </section>
  );
});

export const MarkdownBarcode = memo(function MarkdownBarcode({ source }: { source: string }) {
  const { t } = useTranslation();
  const spec = useMemo(() => parseBarcodeSpec(source), [source]);
  if (spec) return <AgentBarcode spec={spec} />;
  if (looksLikeBarcodeJson(source)) {
    return (
      <div className="ag-inset my-3 flex h-24 items-center justify-center gap-2 rounded-[12px] border border-[var(--ag-line)] text-[12px] text-[var(--ag-text-3)]">
        <SpinIcon icon={LoaderCircle} className="size-3.5" />
        {t("agentChat.barcodeLoading")}
      </div>
    );
  }
  return (
    <pre className="my-3 overflow-x-auto rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-3)] p-3">
      <code>{source}</code>
    </pre>
  );
});
