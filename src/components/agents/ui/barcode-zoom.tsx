import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  barcodeFormat,
  type AgentBarcodeItem,
} from "@/lib/agents/barcode-spec";
import {
  renderBarcodeSvg,
  type BwipModule,
} from "@/lib/agents/barcode-render";

export function BarcodeZoom({
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
    () =>
      item
        ? {
            ...item,
            scale: Math.min(10, Math.max(item.scale * 2, 6)),
            height: item.height ? Math.min(60, item.height * 1.6) : null,
          }
        : null,
    [item],
  );
  const render = useMemo(
    () => (bwip && zoomed ? renderBarcodeSvg(bwip, zoomed) : null),
    [bwip, zoomed],
  );

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(92vw,60rem)]">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">
            {item?.label ??
              barcodeFormat(item?.format ?? "")?.label ??
              t("agentChat.barcodeZoom")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] place-items-center overflow-auto rounded-[var(--ag-r-sm)] border border-[var(--ag-line)] bg-white p-6 [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[60vh] [&_svg]:w-full [&_svg]:object-contain">
          {render?.svg ? (
            <div
              className="w-full [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: render.svg }}
            />
          ) : (
            <p className="px-3 py-6 text-center text-[11px] text-destructive">
              {render?.error}
            </p>
          )}
        </div>
        {item ? (
          <p className="break-all text-center font-mono text-[11px] text-muted-foreground">
            {item.value}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
