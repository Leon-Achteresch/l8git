import { isTauri } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

import { toastError } from "@/lib/error-toast";

let activeUpdateCheck: Promise<void> | null = null;

function updatePromptMessage(version: string, body?: string) {
  const notes = body?.trim();
  if (!notes) {
    return `Version ${version} ist verfuegbar.\n\nJetzt herunterladen und installieren?`;
  }

  return `Version ${version} ist verfuegbar.\n\n${notes}\n\nJetzt herunterladen und installieren?`;
}

function progressMessage(version: string, downloadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) {
    return `Update ${version} wird heruntergeladen...`;
  }

  const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
  return `Update ${version} wird heruntergeladen... ${progress}%`;
}

async function runUpdateCheck(manual: boolean) {
  if (!isTauri()) {
    if (manual) {
      toast.message("Updates sind nur in der Desktop-App verfuegbar.");
    }
    return;
  }

  try {
    const update = await check();

    if (!update) {
      if (manual) {
        toast.success("Du nutzt bereits die neueste Version.");
      }
      return;
    }

    const shouldInstall = await ask(
      updatePromptMessage(update.version, update.body),
      {
        title: "Update verfuegbar",
        kind: "info",
        okLabel: "Installieren",
        cancelLabel: "Spaeter",
      },
    );

    if (!shouldInstall) {
      return;
    }

    let downloadedBytes = 0;
    let totalBytes = 0;
    const toastId = toast.loading(`Update ${update.version} wird vorbereitet...`);

    await update.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case "Started":
          totalBytes = event.data.contentLength ?? 0;
          toast.loading(progressMessage(update.version, downloadedBytes, totalBytes), {
            id: toastId,
          });
          break;
        case "Progress":
          downloadedBytes += event.data.chunkLength;
          toast.loading(progressMessage(update.version, downloadedBytes, totalBytes), {
            id: toastId,
          });
          break;
        case "Finished":
          toast.loading(`Update ${update.version} wird installiert...`, {
            id: toastId,
          });
          break;
        default: {
          const exhaustiveCheck: never = event;
          return exhaustiveCheck;
        }
      }
    });

    toast.success(`Update ${update.version} wurde installiert.`, {
      id: toastId,
    });

    const shouldRestart = await ask(
      "Das Update wurde installiert. Soll l8git jetzt neu starten?",
      {
        title: "Neustart erforderlich",
        kind: "info",
        okLabel: "Neu starten",
        cancelLabel: "Spaeter",
      },
    );

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    toastError(`Update fehlgeschlagen: ${String(error)}`);
  }
}

export async function checkForAppUpdate(options: { manual?: boolean } = {}) {
  const manual = options.manual ?? false;

  if (activeUpdateCheck) {
    return activeUpdateCheck;
  }

  activeUpdateCheck = runUpdateCheck(manual).finally(() => {
    activeUpdateCheck = null;
  });

  return activeUpdateCheck;
}
