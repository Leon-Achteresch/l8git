import { describe, expect, it } from "vitest";

import { BARCODE_TOOL_NAME } from "@/lib/agents/barcode-spec";
import { CHART_TOOL_NAME } from "@/lib/agents/chart-spec";
import { parseImageResult } from "@/lib/agents/plugins/image-blocks";
import { markdownResult, stripLineGutter } from "@/lib/agents/plugins/markdown-result";
import { rendererResult } from "@/lib/agents/plugins/renderer-result";

describe("parseImageResult", () => {
  it("baut Data-URLs aus MCP- und Anthropic-Blocks", () => {
    const result = parseImageResult([
      { type: "text", text: "Screenshot" },
      { type: "image", mimeType: "image/png", data: "AAA" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBB" } },
      { type: "image", source: { type: "url", url: "https://example.test/a.png" } },
    ]);
    expect(result?.images.map((image) => image.src)).toEqual([
      "data:image/png;base64,AAA",
      "data:image/jpeg;base64,BBB",
      "https://example.test/a.png",
    ]);
    expect(result?.text).toBe("Screenshot");
  });

  it("greift nicht ohne Bild-Block", () => {
    expect(parseImageResult([{ type: "text", text: "nur Text" }])).toBeNull();
    expect(parseImageResult([{ type: "image", mimeType: "text/plain", data: "AAA" }])).toBeNull();
    expect(parseImageResult("Text")).toBeNull();
  });
});

describe("stripLineGutter", () => {
  it("entfernt die Zeilennummern-Rinne", () => {
    expect(stripLineGutter("   1→# Titel\n   2→Text")).toBe("# Titel\nText");
  });

  it("laesst Text ohne durchgaengige Rinne unangetastet", () => {
    const text = "   1→# Titel\nnormale Zeile\nnoch eine\nund noch eine";
    expect(stripLineGutter(text)).toBe(text);
  });
});

describe("markdownResult", () => {
  it("greift bei WebFetch und Markdown-Dateien", () => {
    expect(markdownResult("# Doku", "WebFetch", { url: "https://example.test" })).toBe("# Doku");
    expect(markdownResult("# Doku", "mcp__claude_ai_Atlassian__fetch", {})).toBe("# Doku");
    expect(markdownResult([{ type: "text", text: "  1→# Doku" }], "Read", { file_path: "a/README.md" })).toBe("# Doku");
  });

  it("greift nicht bei Code und fremden Tools", () => {
    expect(markdownResult("# comment", "Read", { file_path: "a/deploy.sh" })).toBeNull();
    expect(markdownResult("# Doku", "Grep", { pattern: "x" })).toBeNull();
    expect(markdownResult("   ", "WebFetch", {})).toBeNull();
  });
});

describe("rendererResult", () => {
  it("baut eine Chart-Karte aus gültigen Argumenten", () => {
    const outcome = rendererResult(
      "ok",
      CHART_TOOL_NAME,
      { type: "bar", series: [{ label: "A", data: [{ x: "Jan", y: 1 }] }] },
    );
    expect(outcome).toMatchObject({ kind: "chart", spec: { type: "bar" } });
  });

  it("gibt einen Fehlerblock statt einer leeren Karte bei ungültigen Chart-Daten", () => {
    expect(rendererResult("ok", CHART_TOOL_NAME, { type: "pie" })).toEqual({
      kind: "chart",
      error: "Ungültige Diagrammdaten – Diagramm konnte nicht dargestellt werden.",
    });
  });

  it("baut eine Barcode-Karte aus gültigen Argumenten", () => {
    const outcome = rendererResult(
      "ok",
      BARCODE_TOOL_NAME,
      { items: [{ format: "code128", value: "A1" }] },
    );
    expect(outcome).toMatchObject({ kind: "barcode", spec: { items: [{ format: "code128" }] } });
  });

  it("gibt einen Fehlerblock statt einer leeren Karte bei ungültigen Barcode-Daten", () => {
    expect(rendererResult("ok", BARCODE_TOOL_NAME, { items: [{ format: "nope" }] })).toEqual({
      kind: "barcode",
      error: "Ungültige Barcode-Daten – Barcode konnte nicht dargestellt werden.",
    });
  });

  it("erkennt Browser-Tool-Ergebnisse und gibt den Text zurück", () => {
    expect(rendererResult("Titel: Beispiel", "browser_navigate", {})).toEqual({
      kind: "browser",
      text: "Titel: Beispiel",
    });
  });

  it("gibt einen Fehlerblock statt einer leeren Karte bei leerem Browser-Ergebnis", () => {
    expect(rendererResult("", "browser_navigate", {})).toEqual({
      kind: "browser",
      error: "Browser-Tool lieferte kein auswertbares Ergebnis.",
    });
  });

  it("greift nicht bei fremden Tools", () => {
    expect(rendererResult("ok", "Read", {})).toBeNull();
  });
});
