import { openExternal } from "@/components/hub/hub-bits";
import type { CiRun } from "@/lib/github-expansion/ci";
import { safeExternalUrl } from "@/lib/github-ci-ui/ci-model";
import { base64Bytes } from "@/lib/github-ci-ui/logs";
import { errorKind } from "@/lib/github-ci-ui/reads";
import { cn } from "@/lib/utils";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type RunX = CiRun & { run_number?: number; display_title?: string; actor?: { login: string } | null };

export function StatusIcon({ status, conclusion, className }: { status: string; conclusion: string | null; className?: string }) {
  const c = cn("h-3.5 w-3.5 shrink-0", className);
  if (status !== "completed") return status === "in_progress" ? <Loader2 className={cn(c, "animate-spin text-primary")} /> : <CircleDashed className={cn(c, "text-muted-foreground")} />;
  if (conclusion === "success") return <CheckCircle2 className={cn(c, "text-git-added")} />;
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure") return <XCircle className={cn(c, "text-git-removed")} />;
  return <MinusCircle className={cn(c, "text-muted-foreground")} />;
}

export function StatusText({ status, conclusion }: { status: string; conclusion: string | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusIcon status={status} conclusion={conclusion} />
      <span className="capitalize">{(status === "completed" ? conclusion : status)?.replace(/_/g, " ") ?? status}</span>
    </span>
  );
}

/** Honest error states: permission / missing / rate limit / other, always with the provider message. */
export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  const { t } = useTranslation();
  const kind = errorKind(error);
  return (
    <div role="alert" className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs", className)}>
      <p className="font-medium text-destructive">{t(`ghci.error.${kind}`)}</p>
      <p className="mt-0.5 break-words font-mono text-[0.625rem] text-muted-foreground">{String(error)}</p>
    </div>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <Loader2 className="h-3 w-3 animate-spin" />
      {t("ghci.loading")}
    </p>
  );
}

/** External link via the platform opener; non-http(s) values render as plain text. */
export function ExtLink({ href, children, className }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  const url = safeExternalUrl(href);
  if (!url) return <span className={className}>{children}</span>;
  return (
    <button type="button" onClick={() => openExternal(url)} className={cn("inline-flex items-center gap-0.5 text-primary hover:underline focus-visible:underline focus-visible:outline-none", className)}>
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </button>
  );
}

export const shortSha = (sha: string) => sha.slice(0, 7);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

/** User-chosen save of downloaded bytes (ZIP or text). Returns false when the dialog is cancelled. */
export async function saveBytes(fileName: string, base64: string, contentType: string): Promise<boolean> {
  if (isTauri()) {
    const ext = /\.([\w]+)$/.exec(fileName)?.[1];
    const path = await save({ defaultPath: fileName, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined });
    if (!path) return false;
    await invoke("save_user_export_bytes", { path, base64 });
    return true;
  }
  const url = URL.createObjectURL(new Blob([base64Bytes(base64) as BlobPart], { type: contentType || "application/octet-stream" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}

export function textBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function runLabel(run: RunX): string {
  return `${run.name} #${run.run_number ?? run.id} · ${shortSha(run.head_sha)}${run.run_attempt > 1 ? ` · #${run.run_attempt}` : ""}`;
}
