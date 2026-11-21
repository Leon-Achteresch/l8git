import type { Root, RootContent } from "hast";
import { useGithubTarget, isTarget } from "@/lib/github-ui/target";
import { githubAttachment, publishScreenshot } from "@/lib/hub/screenshot-asset";
import { createContext, useContext, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Square, Undo2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  MAX_POINTS,
  parseScreenshotComment,
  resolveReviewImage,
  screenshotComment,
  type Stroke,
} from "@/lib/pr-screenshot";

type Target = { prUrl?: string; headSha?: string; path: string; number: number; onPosted: () => void };
const pointAt = (event: PointerEvent<SVGSVGElement>): [number, number] => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const unit = (n: number) => Math.round(1000 * Math.max(0, Math.min(1, n)));
  return [
    unit((event.clientX - bounds.left) / bounds.width),
    unit((event.clientY - bounds.top) / bounds.height),
  ];
};

function Ink({ lines }: { lines: Stroke[] }) {
  return lines.map((line, i) => {
    const points = [line[0], ...line].map((p) => p.join(",")).join(" ");
    return (
      <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={points} stroke="white" strokeWidth={5} vectorEffect="non-scaling-stroke" />
        <polyline points={points} stroke="#d92c53" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </g>
    );
  });
}

export function Screenshot({
  src,
  alt,
  saved = [],
  target,
}: {
  src: string;
  alt: string;
  saved?: Stroke[];
  target: Target;
}) {
  const { t } = useTranslation();
  const github = useGithubTarget(target.path);
  const [tool, setTool] = useState<"pen" | "rectangle">("pen");
  const [publishPng, setPublishPng] = useState(false);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Stroke[]>(saved);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [localImage, setLocalImage] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  async function imageFailed() {
    setLoaded(false);
    if (!localImage && isTarget(github)) {
      try {
        const local = await githubAttachment(github, src);
        if (local) {
          setLocalImage(local);
          return;
        }
      } catch {
        /* Keep a link to the provider if the account cannot read the asset. */
      }
    }
    setUnavailable(true);
  }
  const pointer = useRef<number | null>(null);
  const count = lines.reduce((n, line) => n + line.length, 0);
  async function post() {
    if (busy || !lines.length || !note.trim()) return;
    setBusy(true);
    setError("");
    try {
      let body = screenshotComment(src, lines, note, t("pr.markedArea"));
      if (publishPng && isTarget(github)) {
        const png = await publishScreenshot(github, target.number, localImage || src, lines);
        body = note.trim() + "\n\n![Screenshot](<" + png + ">)";
      }
      await invoke("pr_add_comment", {
        path: target.path,
        number: target.number,
        body,
        inReplyTo: null,
        filePath: null,
        line: null,
      });
    } catch (e) {
      setError(String(e));
      return;
    } finally {
      setBusy(false);
    }
    setOpen(false);
    setNote("");
    setLines(saved);
    target.onPosted();
  }
  return (
    <span className="my-1 inline-flex max-w-full flex-col items-start gap-1 align-top">
      <span className="relative inline-block max-w-full">
        <img
          src={localImage || src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="block max-h-64 max-w-full rounded-md"
          onLoad={() => setLoaded(true)}
          onError={() => void imageFailed()}
        />
        {saved.length > 0 && (
          <svg
            aria-hidden="true"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <Ink lines={saved} />
          </svg>
        )}
      </span>
      {unavailable && (
        <a href={src} target="_blank" rel="noreferrer">
          {t("pr.openImage")}
        </a>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!loaded}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Pencil />
        {t("pr.annotateImage")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            pointer.current = null;
            setOpen(value);
          }
        }}
      >
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl" aria-describedby={undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle>{t("pr.annotateImage")}</DialogTitle>
            <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
              {(["pen", "rectangle"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={tool === mode ? "secondary" : "ghost"}
                  aria-pressed={tool === mode}
                  disabled={busy}
                  onClick={() => setTool(mode)}
                >
                  {mode === "pen" ? <Pencil /> : <Square />}
                  {t(mode === "pen" ? "pr.penTool" : "pr.rectangleTool")}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid place-items-center overflow-hidden rounded-lg border bg-muted/40 p-2">
            <div className="relative max-w-full">
              <img
                src={localImage || src}
                alt={alt}
                draggable={false}
                referrerPolicy="no-referrer"
                className="block max-h-[54vh] max-w-full"
              />
              <svg
                aria-label={t("pr.drawHint")}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full touch-none cursor-crosshair"
                onPointerDown={(e) => {
                  if (
                    busy ||
                    pointer.current !== null ||
                    e.button !== 0 ||
                    count + (tool === "rectangle" ? 5 : 1) > MAX_POINTS
                  )
                    return;
                  pointer.current = e.pointerId;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = pointAt(e);
                  setLines((prev) => [...prev, [p]]);
                }}
                onPointerMove={(e) => {
                  if (pointer.current !== e.pointerId || (tool === "pen" && count >= MAX_POINTS)) return;
                  const p = pointAt(e);
                  setLines((prev) => {
                    const last = prev[prev.length - 1];
                    if (tool === "rectangle" && last) {
                      const start = last[0];
                      const box: Stroke = [start, [p[0], start[1]], p, [start[0], p[1]], start];
                      return [...prev.slice(0, -1), box];
                    }
                    const end = last?.[last.length - 1];
                    if (!end || Math.hypot(p[0] - end[0], p[1] - end[1]) < 3) return prev;
                    return [...prev.slice(0, -1), [...last, p]];
                  });
                }}
                onLostPointerCapture={(e) => {
                  if (pointer.current === e.pointerId) pointer.current = null;
                }}
              >
                <Ink lines={lines} />
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {count >= MAX_POINTS ? t("pr.inkLimit") : t("pr.drawHint")}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !lines.length}
              onClick={() => setLines(lines.slice(0, -1))}
            >
              <Undo2 />
              {t("pr.undoStroke")}
            </Button>
          </div>
          <Textarea
            aria-label={t("pr.conversationPlaceholder")}
            placeholder={t("pr.conversationPlaceholder")}
            value={note}
            maxLength={8000}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
          {isTarget(github) && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={publishPng}
                disabled={busy}
                onChange={(e) => setPublishPng(e.target.checked)}
              />
              {t("pr.publishScreenshotPng")}
            </label>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button disabled={busy || !lines.length || !note.trim()} onClick={() => void post()}>
              {busy ? t("pr.conversationSending") : t("pr.conversationSubmit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}

function attachmentImages() {
  return (root: Root) => {
    function visit(children: RootContent[]) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === "element") visit(child.children);
        if (child.type !== "raw" || !/^\s*<img\s/i.test(child.value)) continue;
        const template = document.createElement("template");
        template.innerHTML = child.value;
        const img = template.content.firstElementChild;
        if (img?.tagName !== "IMG" || template.content.childElementCount !== 1) continue;
        const src = img.getAttribute("src");
        if (src)
          children[i] = {
            type: "element",
            tagName: "img",
            properties: { src, alt: img.getAttribute("alt") || "" },
            children: [],
          };
      }
    }
    visit(root.children);
  };
}

const ReviewTarget = createContext<Target | null>(null);
const imageComponents: Components = {
  img: function ReviewImage({ src, alt }) {
    const target = useContext(ReviewTarget);
    const url = typeof src === "string" && resolveReviewImage(src, target?.prUrl, target?.headSha);
    if (!target || !url) return <img src={src} alt={alt || ""} />;
    return <Screenshot key={url} src={url} alt={alt || "Screenshot"} target={target} />;
  },
};

export function PrReviewMarkdown({ body, ...target }: Target & { body: string }) {
  const annotation = parseScreenshotComment(body);
  return (
    <ReviewTarget.Provider value={target}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[attachmentImages]}
        components={imageComponents}
      >
        {annotation?.note ?? body}
      </ReactMarkdown>
      {annotation && (
        <Screenshot src={annotation.src} alt="Screenshot" saved={annotation.lines} target={target} />
      )}
    </ReviewTarget.Provider>
  );
}
