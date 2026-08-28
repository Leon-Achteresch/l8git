export type AgentBarcodeKind = "linear" | "matrix" | "postal";

export interface AgentBarcodeFormat {
  /** Kanonische ID = bwip-js-`bcid`. */
  id: string;
  label: string;
  kind: AgentBarcodeKind;
  /** Was der Wert enthalten darf — geht so auch in die Formatdoku für den Agenten. */
  hint: string;
  sample: string;
}

/**
 * Kuratierte Formate: alles, was in Lager, Handel, Logistik, Pharma und Post
 * tatsächlich gescannt wird. Weitere bwip-js-Symbologien sind über
 * `ADDITIONAL_BCIDS` erlaubt, tauchen aber nicht in Doku und Picker auf.
 */
export const BARCODE_FORMATS: AgentBarcodeFormat[] = [
  { id: "code128", label: "Code 128", kind: "linear", hint: "Beliebiger ASCII-Text, variable Länge.", sample: "ORDER-4711" },
  { id: "gs1-128", label: "GS1-128", kind: "linear", hint: "GS1-Element-Strings in Klammern, z. B. (01)…(10)….", sample: "(01)09521234543213(10)LOT42" },
  { id: "code39", label: "Code 39", kind: "linear", hint: "A–Z, 0–9 und - . $ / + % sowie Leerzeichen.", sample: "WERK-7" },
  { id: "code93", label: "Code 93", kind: "linear", hint: "A–Z, 0–9 und - . $ / + % sowie Leerzeichen.", sample: "PALETTE93" },
  { id: "rationalizedCodabar", label: "Codabar", kind: "linear", hint: "Ziffern mit Start-/Stoppzeichen A–D, z. B. A1234B.", sample: "A31459B" },
  { id: "interleaved2of5", label: "Interleaved 2 of 5", kind: "linear", hint: "Nur Ziffern, gerade Anzahl.", sample: "12345678" },
  { id: "itf14", label: "ITF-14", kind: "linear", hint: "13 oder 14 Ziffern (Umkarton-GTIN).", sample: "09521234543213" },
  { id: "ean13", label: "EAN-13", kind: "linear", hint: "12 oder 13 Ziffern.", sample: "4006381333931" },
  { id: "ean8", label: "EAN-8", kind: "linear", hint: "7 oder 8 Ziffern.", sample: "96385074" },
  { id: "upca", label: "UPC-A", kind: "linear", hint: "11 oder 12 Ziffern.", sample: "012345678905" },
  { id: "upce", label: "UPC-E", kind: "linear", hint: "7 oder 8 Ziffern.", sample: "01234565" },
  { id: "isbn", label: "ISBN", kind: "linear", hint: "ISBN-13 mit Bindestrichen, optional +Preis-Addon.", sample: "978-3-16-148410-0" },
  { id: "sscc18", label: "SSCC-18", kind: "linear", hint: "Element-String (00) plus 18 Ziffern (Versandeinheit).", sample: "(00)106141411234567897" },
  { id: "pzn", label: "PZN", kind: "linear", hint: "6 oder 7 Ziffern (Pharmazentralnummer).", sample: "1234562" },
  { id: "code32", label: "Italienischer Pharmacode", kind: "linear", hint: "8 oder 9 Ziffern.", sample: "12345678" },
  { id: "pharmacode", label: "Pharmacode", kind: "linear", hint: "Zahl zwischen 3 und 131070.", sample: "117480" },
  { id: "msi", label: "MSI Plessey", kind: "linear", hint: "Nur Ziffern.", sample: "0123456789" },
  { id: "code11", label: "Code 11", kind: "linear", hint: "Ziffern und Bindestrich.", sample: "9871-2" },
  { id: "identcode", label: "Deutsche Post Identcode", kind: "linear", hint: "11 oder 12 Ziffern.", sample: "563102430313" },
  { id: "leitcode", label: "Deutsche Post Leitcode", kind: "linear", hint: "13 oder 14 Ziffern.", sample: "21348075016401" },
  { id: "databaromni", label: "GS1 DataBar", kind: "linear", hint: "GS1-Element-String, meist (01) mit 14 Ziffern.", sample: "(01)24012345678905" },
  { id: "databarexpanded", label: "GS1 DataBar Expanded", kind: "linear", hint: "Mehrere GS1-Element-Strings.", sample: "(01)90012345678908(3103)001750" },
  { id: "qrcode", label: "QR Code", kind: "matrix", hint: "Beliebiger Text oder URL, bis ca. 2 KB.", sample: "https://example.com/beleg/4711" },
  { id: "microqrcode", label: "Micro QR Code", kind: "matrix", hint: "Sehr kurzer Text, bis ca. 35 Zeichen.", sample: "4711" },
  { id: "gs1qrcode", label: "GS1 QR Code", kind: "matrix", hint: "GS1-Element-Strings in Klammern.", sample: "(01)09521234543213(10)LOT42" },
  { id: "datamatrix", label: "Data Matrix", kind: "matrix", hint: "Beliebiger Text, kompakt für Kleinteile.", sample: "SN:AB-99123" },
  { id: "gs1datamatrix", label: "GS1 Data Matrix", kind: "matrix", hint: "GS1-Element-Strings in Klammern.", sample: "(01)09521234543213(17)261231(10)LOT42" },
  { id: "pdf417", label: "PDF417", kind: "matrix", hint: "Große Textmengen, z. B. Ausweis- oder Frachtdaten.", sample: "L8GIT|PDF417|2026-01-31" },
  { id: "micropdf417", label: "MicroPDF417", kind: "matrix", hint: "Kurze Textmengen in schmaler Bauform.", sample: "L8GIT-42" },
  { id: "azteccode", label: "Aztec Code", kind: "matrix", hint: "Beliebiger Text, ohne Ruhezone verwendbar.", sample: "TICKET-2026-0042" },
  { id: "dotcode", label: "DotCode", kind: "matrix", hint: "Beliebiger Text, für Hochgeschwindigkeitsdruck.", sample: "DOT-4711" },
  { id: "hanxin", label: "Han Xin Code", kind: "matrix", hint: "Beliebiger Text inkl. chinesischer Zeichen.", sample: "汉信码-4711" },
  { id: "swissqrcode", label: "Swiss QR Code", kind: "matrix", hint: "Swiss-QR-Rechnungsdatensatz (SPC-Format).", sample: "SPC\n0200\n1\nCH4431999123000889012" },
  { id: "onecode", label: "USPS Intelligent Mail", kind: "postal", hint: "20, 25, 29 oder 31 Ziffern.", sample: "0123456709498765432101234567891" },
  { id: "postnet", label: "USPS POSTNET", kind: "postal", hint: "5, 9 oder 11 Ziffern.", sample: "01234567891" },
  { id: "royalmail", label: "Royal Mail 4-State", kind: "postal", hint: "Großbuchstaben und Ziffern.", sample: "LE28HS9Z" },
  { id: "kix", label: "Royal Dutch KIX", kind: "postal", hint: "Großbuchstaben und Ziffern.", sample: "1231FZ13XHS" },
  { id: "auspost", label: "AusPost 4-State", kind: "postal", hint: "Format-Kennzeichen plus Ziffern.", sample: "5956439111ABA 9" },
  { id: "japanpost", label: "Japan Post 4-State", kind: "postal", hint: "Postleitzahl, danach Ziffern und Bindestriche.", sample: "1500013-3-2-1" },
];

/**
 * Weitere bwip-js-Symbologien. Erlaubt, damit ein Agent auch Exoten setzen kann,
 * ohne dass dieses Modul zur vollständigen bwip-js-Kopie wird.
 */
const ADDITIONAL_BCIDS = [
  "aztecrune", "azteccodecompact", "bc412", "channelcode", "code16k", "code2of5",
  "code39ext", "code49", "code93ext", "codablockf", "codeone", "coop2of5", "daft",
  "databarexpandedstacked", "databarlimited", "databaromnicomposite", "databarstacked",
  "databarstackedomni", "databartruncated", "datalogic2of5", "datamatrixrectangular",
  "datamatrixrectangularextension", "ean13composite", "ean14", "ean2", "ean5", "ean8composite",
  "flattermarken", "gs1-cc", "gs1-128composite", "gs1datamatrixrectangular", "gs1dldatamatrix",
  "gs1dlqrcode", "gs1dotcode", "gs1northamericancoupon", "hibcazteccode", "hibccodablockf",
  "hibccode128", "hibccode39", "hibcdatamatrix", "hibcdatamatrixrectangular", "hibcmicropdf417",
  "hibcpdf417", "hibcqrcode", "iata2of5", "industrial2of5", "ismn", "issn", "mailmark", "mands",
  "matrix2of5", "pdf417compact", "pharmacode2", "planet", "plessey", "posicode",
  "rectangularmicroqrcode", "telepen", "telepennumeric", "ultracode", "upcacomposite",
  "upcecomposite",
];

/** Was Agenten typischerweise schreiben statt der bwip-js-ID. */
const FORMAT_ALIASES: Record<string, string> = {
  "qr": "qrcode",
  "qr-code": "qrcode",
  "microqr": "microqrcode",
  "micro-qr": "microqrcode",
  "dm": "datamatrix",
  "data-matrix": "datamatrix",
  "gs1-datamatrix": "gs1datamatrix",
  "gs1-qrcode": "gs1qrcode",
  "aztec": "azteccode",
  "pdf-417": "pdf417",
  "micro-pdf417": "micropdf417",
  "code-128": "code128",
  "code128a": "code128",
  "code128b": "code128",
  "code128c": "code128",
  "code-39": "code39",
  "code-93": "code93",
  "codabar": "rationalizedCodabar",
  "nw-7": "rationalizedCodabar",
  "code-11": "code11",
  "ean": "ean13",
  "ean-13": "ean13",
  "ean-8": "ean8",
  "upc": "upca",
  "upc-a": "upca",
  "upc-e": "upce",
  "itf": "interleaved2of5",
  "i2of5": "interleaved2of5",
  "itf-14": "itf14",
  "sscc": "sscc18",
  "sscc-18": "sscc18",
  "gs1128": "gs1-128",
  "gs1-databar": "databaromni",
  "databar": "databaromni",
  "usps": "onecode",
  "imb": "onecode",
  "royal-mail": "royalmail",
  "japan-post": "japanpost",
  "aus-post": "auspost",
  "swiss-qr": "swissqrcode",
  "han-xin": "hanxin",
};

const FORMATS_BY_ID = new Map(BARCODE_FORMATS.map((format) => [format.id.toLowerCase(), format]));
const KNOWN_BCIDS = new Set<string>([
  ...BARCODE_FORMATS.map((format) => format.id),
  ...ADDITIONAL_BCIDS,
]);
const BCIDS_BY_LOWER = new Map([...KNOWN_BCIDS].map((bcid) => [bcid.toLowerCase(), bcid]));

export const MAX_BARCODE_ITEMS = 24;
const MAX_VALUE_LENGTH = 2000;
const MAX_LABEL_LENGTH = 160;
const MIN_SCALE = 1;
const MAX_SCALE = 10;
const DEFAULT_SCALE = 3;
const DEFAULT_LINEAR_HEIGHT = 12;
const MAX_LINEAR_HEIGHT = 60;

export interface AgentBarcodeItem {
  /** bwip-js-`bcid`. */
  format: string;
  value: string;
  label?: string;
  caption?: string;
  scale: number;
  /** Strichhöhe für 1D/Postleitcodes; bei Matrixcodes null. */
  height: number | null;
  includeText: boolean;
  altText?: string;
}

export interface AgentBarcodeSpec {
  title?: string;
  items: AgentBarcodeItem[];
}

export function barcodeFormat(id: string): AgentBarcodeFormat | null {
  return FORMATS_BY_ID.get(id.toLowerCase()) ?? null;
}

/** Alias und Groß-/Kleinschreibung auf die bwip-js-ID abbilden. */
export function resolveBarcodeFormat(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/gu, "");
  if (!normalized) return null;
  const aliased = FORMAT_ALIASES[normalized] ?? FORMAT_ALIASES[normalized.replace(/[_ ]/gu, "-")];
  if (aliased) return aliased;
  return BCIDS_BY_LOWER.get(normalized) ?? BCIDS_BY_LOWER.get(normalized.replace(/[-_]/gu, "")) ?? null;
}

/** Bauform der nicht kuratierten Symbologien; alles Übrige ist 1D. */
const ADDITIONAL_KINDS: Record<string, AgentBarcodeKind> = {
  aztecrune: "matrix",
  azteccodecompact: "matrix",
  codeone: "matrix",
  datamatrixrectangular: "matrix",
  datamatrixrectangularextension: "matrix",
  "gs1-cc": "matrix",
  gs1datamatrixrectangular: "matrix",
  gs1dldatamatrix: "matrix",
  gs1dlqrcode: "matrix",
  gs1dotcode: "matrix",
  hibcazteccode: "matrix",
  hibcdatamatrix: "matrix",
  hibcdatamatrixrectangular: "matrix",
  hibcmicropdf417: "matrix",
  hibcpdf417: "matrix",
  hibcqrcode: "matrix",
  pdf417compact: "matrix",
  rectangularmicroqrcode: "matrix",
  ultracode: "matrix",
  daft: "postal",
  mailmark: "postal",
  planet: "postal",
};

export function barcodeKind(format: string): AgentBarcodeKind {
  return barcodeFormat(format)?.kind ?? ADDITIONAL_KINDS[format] ?? "linear";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, limit);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeScale(value: unknown): number {
  const raw = typeof value === "string" ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_SCALE;
  return clamp(Math.round(raw), MIN_SCALE, MAX_SCALE);
}

function normalizeHeight(value: unknown, kind: AgentBarcodeKind): number | null {
  if (kind === "matrix") return null;
  const raw = typeof value === "string" ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_LINEAR_HEIGHT;
  return clamp(raw, 4, MAX_LINEAR_HEIGHT);
}

function normalizeItem(value: unknown): AgentBarcodeItem | null {
  if (!isRecord(value)) return null;
  const format = resolveBarcodeFormat(value.format ?? value.type ?? value.symbology);
  if (!format) return null;
  const rawValue = value.value ?? value.text ?? value.data ?? value.content;
  const text = typeof rawValue === "number" ? String(rawValue) : rawValue;
  if (typeof text !== "string" || !text.trim() || text.length > MAX_VALUE_LENGTH) return null;
  const kind = barcodeKind(format);
  return {
    format,
    value: text,
    label: optionalText(value.label ?? value.title ?? value.name, MAX_LABEL_LENGTH),
    caption: optionalText(value.caption ?? value.description, MAX_LABEL_LENGTH),
    scale: normalizeScale(value.scale),
    height: normalizeHeight(value.height, kind),
    // Klartext unter dem Code hilft beim Abgleich von Hand, ergibt bei
    // Matrixcodes aber nur Rauschen.
    includeText: kind === "matrix" ? value.includeText === true : value.includeText !== false,
    altText: optionalText(value.altText, MAX_LABEL_LENGTH),
  };
}

/**
 * Akzeptiert drei Formen: ein einzelnes Item, `{ title, items: [...] }`
 * und ein blankes Item-Array.
 */
export function parseBarcodeSpec(source: string): AgentBarcodeSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  const rawItems = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.barcodes)
          ? raw.barcodes
          : [raw]
      : null;
  if (!rawItems || rawItems.length === 0 || rawItems.length > MAX_BARCODE_ITEMS) return null;

  const items: AgentBarcodeItem[] = [];
  for (const candidate of rawItems) {
    const item = normalizeItem(candidate);
    if (!item) return null;
    items.push(item);
  }

  const title = isRecord(raw) && !Array.isArray(raw.items) && !Array.isArray(raw.barcodes)
    ? undefined // Bei der Einzelform ist `title` das Item-Label, nicht die Überschrift.
    : isRecord(raw)
      ? optionalText(raw.title, MAX_LABEL_LENGTH)
      : undefined;

  return { title, items };
}

export function looksLikeBarcodeJson(source: string): boolean {
  const trimmed = source.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * bwip-js-Renderoptionen. Ruhezonen sind bewusst großzügig: ohne sie lesen
 * Handscanner den Code vom Bildschirm oft nicht.
 */
export function barcodeRenderOptions(item: AgentBarcodeItem): Record<string, unknown> {
  const kind = barcodeKind(item.format);
  const base: Record<string, unknown> = {
    bcid: item.format,
    text: item.value,
    scale: item.scale,
    includetext: item.includeText,
    textxalign: "center",
    // Scanner brauchen den harten Schwarz-Weiß-Kontrast; das Panel bleibt
    // deshalb auch im Dark Mode weiß.
    barcolor: "000000",
    backgroundcolor: "FFFFFF",
    textcolor: "000000",
  };
  if (item.altText) base.alttext = item.altText;
  if (kind === "matrix") {
    base.padding = 4;
  } else {
    base.height = item.height ?? DEFAULT_LINEAR_HEIGHT;
    base.paddingwidth = 10;
    base.paddingheight = 4;
  }
  return base;
}

const DOC_FORMATS = BARCODE_FORMATS
  .map((format) => `- \`${format.id}\` — ${format.label}: ${format.hint}`)
  .join("\n");

export const BARCODE_FORMAT_DOC = `To render a scannable barcode in this UI, output a fenced code block with the language \`barcode\` containing a single JSON object:

\`\`\`barcode
{
  "title": "Pick list 4711",
  "items": [
    { "format": "code128", "value": "ORDER-4711", "label": "Order" },
    { "format": "qrcode", "value": "https://example.com/orders/4711", "label": "Details" }
  ]
}
\`\`\`

Rules:
- Every item needs "format" and "value". "label", "caption", "scale" (1-10), "height" (linear bar height, 4-60) and "includeText" are optional.
- For a single barcode you may drop "items" and use the item object directly.
- At most ${MAX_BARCODE_ITEMS} items per block, at most ${MAX_VALUE_LENGTH} characters per value.
- Put the exact payload in "value" — no prose, no quotes around it, no line breaks unless the symbology needs them.
- Respect the input rules of the symbology; an invalid payload renders an error instead of a barcode.
- GS1 formats take element strings in parentheses, e.g. "(01)09521234543213(10)LOT42".
- Never put comments or trailing commas inside the JSON.
- Add one short sentence after the block saying what the code encodes.

Supported formats:
${DOC_FORMATS}`;

export function barcodePrompt(request: string): string {
  return `${request.trim()}\n\n${BARCODE_FORMAT_DOC}`;
}

export const BARCODE_TOOL_NAME = "mcp__l8git__render_barcode";

export const BARCODE_TOOL = {
  name: "render_barcode",
  description:
    "Rendert scannbare Barcodes direkt in der l8git-Chat-UI. Nutze das, sobald ein Wert an einem Scanner abgegriffen werden soll (Auftrags-, Artikel-, Seriennummern, GTINs, Ladungsträger, URLs). Daten dafür dürfen aus jeder Quelle kommen, auch aus MCP-Tools. Nach dem Tool-Call folgt ein Satz, der sagt, was codiert ist.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      title: { type: "string", description: "Überschrift über der Barcode-Gruppe." },
      items: {
        type: "array",
        minItems: 1,
        maxItems: MAX_BARCODE_ITEMS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["format", "value"],
          properties: {
            format: {
              type: "string",
              enum: BARCODE_FORMATS.map((format) => format.id),
              description: "Symbologie, z. B. code128, ean13, qrcode, gs1datamatrix.",
            },
            value: { type: "string", description: "Exakte Nutzlast, die codiert wird." },
            label: { type: "string", description: "Kurze Bezeichnung über dem Code." },
            caption: { type: "string", description: "Zusatzzeile unter dem Code." },
            scale: { type: "number", minimum: MIN_SCALE, maximum: MAX_SCALE },
            height: { type: "number", minimum: 4, maximum: MAX_LINEAR_HEIGHT, description: "Strichhöhe bei 1D-Codes." },
            includeText: { type: "boolean", description: "Klartext unter dem Code." },
          },
        },
      },
    },
  },
} as const;
