import { LoaderCircle } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarcodeCard } from "@/components/agents/ui/barcode-card";
import { BarcodeZoom } from "@/components/agents/ui/barcode-zoom";
import { SpinIcon } from "@/components/motion/kit";
import {
  looksLikeBarcodeJson,
  parseBarcodeSpec,
  type AgentBarcodeItem,
  type AgentBarcodeSpec,
} from "@/lib/agents/barcode-spec";
import {
  loadBwip,
  renderBarcodeSvg,
  type BwipModule,
} from "@/lib/agents/barcode-render";
import { cn } from "@/lib/utils";

export { renderBarcodeSvg };
export type { BwipModule, BarcodeRender } from "@/lib/agents/barcode-render";

function useBwip(): BwipModule | null {
  const [module, setModule] = useState<BwipModule | null>(null);
  useEffect(() => {
    let active = true;
    void loadBwip()
      .then((loaded) => {
        if (active) setModule(loaded);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return module;
}

export const AgentBarcode = memo(function AgentBarcode({
  spec,
}: {
  spec: AgentBarcodeSpec;
}) {
  const bwip = useBwip();
  const [zoom, setZoom] = useState<AgentBarcodeItem | null>(null);
  const multiple = spec.items.length > 1;

  return (
    <section className="ag-barcode my-3 min-w-0 max-w-full rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface)] p-3">
      {spec.title ? (
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--ag-text)]">
          {spec.title}
        </h4>
      ) : null}
      <div className={cn("grid gap-3", multiple && "sm:grid-cols-2")}>
        {spec.items.map((item, index) => (
          <BarcodeCard
            key={`${item.format}:${item.value}:${index}`}
            item={item}
            bwip={bwip}
            onZoom={setZoom}
          />
        ))}
      </div>
      <BarcodeZoom item={zoom} bwip={bwip} onClose={() => setZoom(null)} />
    </section>
  );
});

export const MarkdownBarcode = memo(function MarkdownBarcode({
  source,
}: {
  source: string;
}) {
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
