import {
  barcodeRenderOptions,
  type AgentBarcodeItem,
} from "@/lib/agents/barcode-spec";

export type BwipModule = typeof import("bwip-js/browser");

let bwipPromise: Promise<BwipModule> | null = null;
export function loadBwip(): Promise<BwipModule> {
  bwipPromise ??= import("bwip-js/browser");
  return bwipPromise;
}

export interface BarcodeRender {
  svg: string | null;
  error: string | null;
}

export function renderBarcodeSvg(
  bwip: BwipModule,
  item: AgentBarcodeItem,
): BarcodeRender {
  try {
    const options = barcodeRenderOptions(
      item,
    ) as unknown as Parameters<BwipModule["toSVG"]>[0];
    const svg = bwip.toSVG(options);
    if (!svg.startsWith("<svg"))
      return {
        svg: null,
        error: "Unerwartete Ausgabe des Barcode-Renderers.",
      };
    return { svg, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { svg: null, error: message.replace(/^bwipp\.[^:]+:\s*/u, "") };
  }
}
