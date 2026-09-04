import { describe, expect, it } from "vitest";

import {
  BARCODE_FORMATS,
  BARCODE_TOOL,
  BARCODE_TOOL_NAME,
  barcodeKind,
  barcodePrompt,
  barcodeRenderOptions,
  CODEX_BARCODE_TOOL,
  isBarcodeToolName,
  looksLikeBarcodeJson,
  MAX_BARCODE_ITEMS,
  OPENCODE_BARCODE_TOOL_NAME,
  parseBarcodeSpec,
  resolveBarcodeFormat,
} from "@/lib/agents/barcode-spec";

describe("resolveBarcodeFormat", () => {
  it("maps aliases and casing onto the bwip-js id", () => {
    expect(resolveBarcodeFormat("qr")).toBe("qrcode");
    expect(resolveBarcodeFormat("QR-Code")).toBe("qrcode");
    expect(resolveBarcodeFormat("Code-128")).toBe("code128");
    expect(resolveBarcodeFormat("EAN 13")).toBe("ean13");
    expect(resolveBarcodeFormat("codabar")).toBe("rationalizedCodabar");
    expect(resolveBarcodeFormat("gs1-datamatrix")).toBe("gs1datamatrix");
  });

  it("keeps uncurated but known symbologies", () => {
    expect(resolveBarcodeFormat("telepen")).toBe("telepen");
    expect(resolveBarcodeFormat("mailmark")).toBe("mailmark");
  });

  it("rejects unknown symbologies", () => {
    expect(resolveBarcodeFormat("hyperbarcode")).toBeNull();
    expect(resolveBarcodeFormat("")).toBeNull();
    expect(resolveBarcodeFormat(42)).toBeNull();
  });
});

describe("parseBarcodeSpec", () => {
  it("parses a titled group", () => {
    const spec = parseBarcodeSpec(JSON.stringify({
      title: "Pick list",
      items: [
        { format: "code128", value: "ORDER-4711", label: "Order" },
        { format: "qr", value: "https://example.com", caption: "Details" },
      ],
    }));
    expect(spec?.title).toBe("Pick list");
    expect(spec?.items).toHaveLength(2);
    expect(spec?.items[0]).toMatchObject({ format: "code128", value: "ORDER-4711", label: "Order" });
    expect(spec?.items[1].format).toBe("qrcode");
    expect(spec?.items[1].caption).toBe("Details");
  });

  it("accepts a bare single item and treats title as its label", () => {
    const spec = parseBarcodeSpec(JSON.stringify({ format: "ean13", value: "4006381333931", title: "Artikel" }));
    expect(spec?.title).toBeUndefined();
    expect(spec?.items).toHaveLength(1);
    expect(spec?.items[0].label).toBe("Artikel");
  });

  it("accepts a bare item array", () => {
    const spec = parseBarcodeSpec(JSON.stringify([{ format: "code39", value: "WERK-7" }]));
    expect(spec?.items[0].format).toBe("code39");
  });

  it("accepts text/data aliases and numeric values", () => {
    expect(parseBarcodeSpec(JSON.stringify({ format: "code128", text: "A1" }))?.items[0].value).toBe("A1");
    expect(parseBarcodeSpec(JSON.stringify({ format: "code128", data: "B2" }))?.items[0].value).toBe("B2");
    expect(parseBarcodeSpec(JSON.stringify({ format: "ean8", value: 96385074 }))?.items[0].value).toBe("96385074");
  });

  it("applies defaults per symbology kind", () => {
    const linear = parseBarcodeSpec(JSON.stringify({ format: "code128", value: "A" }))?.items[0];
    expect(linear).toMatchObject({ scale: 3, height: 12, includeText: true });

    const matrix = parseBarcodeSpec(JSON.stringify({ format: "qrcode", value: "A" }))?.items[0];
    expect(matrix).toMatchObject({ scale: 3, height: null, includeText: false });
  });

  it("clamps scale and height", () => {
    const spec = parseBarcodeSpec(JSON.stringify([
      { format: "code128", value: "A", scale: 99, height: 500 },
      { format: "code128", value: "B", scale: 0, height: -3 },
    ]));
    expect(spec?.items[0]).toMatchObject({ scale: 10, height: 60 });
    expect(spec?.items[1]).toMatchObject({ scale: 1, height: 12 });
  });

  it("rejects invalid input", () => {
    expect(parseBarcodeSpec("not json")).toBeNull();
    expect(parseBarcodeSpec("[]")).toBeNull();
    expect(parseBarcodeSpec(JSON.stringify({ value: "no format" }))).toBeNull();
    expect(parseBarcodeSpec(JSON.stringify({ format: "code128" }))).toBeNull();
    expect(parseBarcodeSpec(JSON.stringify({ format: "code128", value: "   " }))).toBeNull();
    expect(parseBarcodeSpec(JSON.stringify({ format: "nope", value: "A" }))).toBeNull();
    expect(parseBarcodeSpec(JSON.stringify({ format: "code128", value: "x".repeat(2001) }))).toBeNull();
  });

  it("rejects oversized groups", () => {
    const items = Array.from({ length: MAX_BARCODE_ITEMS + 1 }, (_, index) => ({
      format: "code128",
      value: `A${index}`,
    }));
    expect(parseBarcodeSpec(JSON.stringify({ items }))).toBeNull();
  });
});

describe("barcodeRenderOptions", () => {
  it("gives linear codes a bar height and a wide quiet zone", () => {
    const item = parseBarcodeSpec(JSON.stringify({ format: "code128", value: "ORDER-4711" }))!.items[0];
    expect(barcodeRenderOptions(item)).toMatchObject({
      bcid: "code128",
      text: "ORDER-4711",
      height: 12,
      paddingwidth: 10,
      includetext: true,
      backgroundcolor: "FFFFFF",
    });
  });

  it("gives matrix codes the four-module quiet zone and no bar height", () => {
    const item = parseBarcodeSpec(JSON.stringify({ format: "qrcode", value: "https://example.com" }))!.items[0];
    const options = barcodeRenderOptions(item);
    expect(options).toMatchObject({ bcid: "qrcode", padding: 4 });
    expect(options.height).toBeUndefined();
  });
});

describe("barcodeKind", () => {
  it("classifies curated and uncurated symbologies", () => {
    expect(barcodeKind("code128")).toBe("linear");
    expect(barcodeKind("qrcode")).toBe("matrix");
    expect(barcodeKind("postnet")).toBe("postal");
    expect(barcodeKind("codeone")).toBe("matrix");
    expect(barcodeKind("planet")).toBe("postal");
    expect(barcodeKind("telepen")).toBe("linear");
  });
});

describe("looksLikeBarcodeJson", () => {
  it("detects leading JSON while a block still streams", () => {
    expect(looksLikeBarcodeJson('  {"format": "code128"')).toBe(true);
    expect(looksLikeBarcodeJson("[{")).toBe(true);
    expect(looksLikeBarcodeJson("some prose")).toBe(false);
  });
});

describe("barcodePrompt", () => {
  it("combines the request with the format documentation", () => {
    const prompt = barcodePrompt("  Auftragsnummern aus der DB  ");
    expect(prompt.startsWith("Auftragsnummern aus der DB")).toBe(true);
    expect(prompt).toContain("```barcode");
    expect(prompt).toContain("`code128`");
  });

  it("documents every curated format", () => {
    for (const format of BARCODE_FORMATS) {
      expect(barcodePrompt("x")).toContain(`\`${format.id}\``);
    }
  });
});

describe("barcode tool adapters", () => {
  it("uses the provider-specific names emitted by Claude, Codex and OpenCode", () => {
    expect(isBarcodeToolName(BARCODE_TOOL_NAME)).toBe(true);
    expect(isBarcodeToolName(BARCODE_TOOL.name)).toBe(true);
    expect(isBarcodeToolName(OPENCODE_BARCODE_TOOL_NAME)).toBe(true);
    expect(isBarcodeToolName("render_chart")).toBe(false);
  });

  it("wraps the shared declaration as a Codex dynamic function tool", () => {
    expect(CODEX_BARCODE_TOOL).toMatchObject({
      type: "function",
      name: "render_barcode",
      inputSchema: BARCODE_TOOL.inputSchema,
    });
  });
});
