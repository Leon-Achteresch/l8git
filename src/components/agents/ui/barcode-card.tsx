import { Copy, Download, LoaderCircle, Maximize2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "@/components/agents/ui/item-context-menu";
import { SpinIcon } from "@/components/motion/kit";
import {
  barcodeFormat,
  type AgentBarcodeItem,
} from "@/lib/agents/barcode-spec";
import {
  renderBarcodeSvg,
  type BwipModule,
} from "@/lib/agents/barcode-render";

function downloadSvg(svg: string, name: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/gu, "-").slice(0, 60) || "barcode"}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

export function BarcodeCard({
  item,
  bwip,
  onZoom,
}: {
  item: AgentBarcodeItem;
  bwip: BwipModule | null;
  onZoom: (item: AgentBarcodeItem) => void;
}) {
  const { t } = useTranslation();
  const render = useMemo(
    () => (bwip ? renderBarcodeSvg(bwip, item) : null),
    [bwip, item],
  );
  const format = barcodeFormat(item.format);

  return (
    <figure className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--ag-text)]">
          {item.label ?? format?.label ?? item.format}
        </span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-[var(--ag-text-3)]">
          {format?.label ?? item.format}
        </span>
      </div>
      <div className="mt-1.5 overflow-hidden rounded-[var(--ag-r-sm)] border border-[var(--ag-line)] bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-56 [&_svg]:w-full [&_svg]:object-contain">
        {render?.svg ? (
          <button
            type="button"
            onClick={() => onZoom(item)}
            title={t("agentChat.barcodeZoom")}
            aria-label={t("agentChat.barcodeZoom")}
            className="block w-full cursor-zoom-in"
            dangerouslySetInnerHTML={{ __html: render.svg }}
          />
        ) : render?.error ? (
          <p className="px-3 py-6 text-center text-[11px] leading-5 text-destructive">
            {render.error}
          </p>
        ) : (
          <div className="flex h-24 items-center justify-center gap-2 text-[11px] text-[var(--ag-text-3)]">
            <SpinIcon icon={LoaderCircle} className="size-3.5" />
            {t("agentChat.barcodeLoading")}
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <code
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--ag-text-2)]"
          title={item.value}
        >
          {item.value}
        </code>
        <button
          type="button"
          className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring size-6 shrink-0 justify-center p-0"
          title={t("agentChat.barcodeCopy")}
          aria-label={t("agentChat.barcodeCopy")}
          onClick={() =>
            copyToClipboard(item.value, t("agentChat.barcodeCopied"))
          }
        >
          <Copy className="size-3" />
        </button>
        {render?.svg ? (
          <>
            <button
              type="button"
              className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring size-6 shrink-0 justify-center p-0"
              title={t("agentChat.barcodeDownload")}
              aria-label={t("agentChat.barcodeDownload")}
              onClick={() =>
                downloadSvg(render.svg!, item.label ?? item.value)
              }
            >
              <Download className="size-3" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring size-6 shrink-0 justify-center p-0"
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
        <p className="text-[var(--ag-text-3)] mt-1 break-words text-[10px] leading-4">
          {item.caption}
        </p>
      ) : null}
    </figure>
  );
}
