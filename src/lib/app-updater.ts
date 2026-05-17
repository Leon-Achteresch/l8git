import i18n from "@/lib/i18n";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

type AppUpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "up-to-date"
  | "unsupported"
  | "error";

type AppUpdateStore = {
  open: boolean;
  phase: AppUpdatePhase;
  version: string | null;
  currentVersion: string | null;
  notes: string;
  publishedAt: string | null;
  errorMessage: string;
  downloadedBytes: number;
  totalBytes: number;
  pendingUpdate: Update | null;
  setDialogState: (
    next: Partial<Omit<AppUpdateStore, "setDialogState" | "resetDialog">>,
  ) => void;
  resetDialog: () => void;
};

const initialDialogState = {
  open: false,
  phase: "idle" as AppUpdatePhase,
  version: null,
  currentVersion: null,
  notes: "",
  publishedAt: null,
  errorMessage: "",
  downloadedBytes: 0,
  totalBytes: 0,
  pendingUpdate: null,
};

export const useAppUpdateStore = create<AppUpdateStore>()((set) => ({
  ...initialDialogState,
  setDialogState: (next) => set(next),
  resetDialog: () => set(initialDialogState),
}));

let activeUpdateCheck: Promise<void> | null = null;

async function releasePendingUpdate(update: Update | null) {
  if (!update) return;
  try {
    await update.close();
  } catch {
    return;
  }
}

function updateDialogState(
  next: Partial<Omit<AppUpdateStore, "setDialogState" | "resetDialog">>,
) {
  useAppUpdateStore.getState().setDialogState(next);
}

function setAvailableUpdate(update: Update) {
  const previous = useAppUpdateStore.getState().pendingUpdate;
  if (previous && previous !== update) {
    void releasePendingUpdate(previous);
  }

  updateDialogState({
    open: true,
    phase: "available",
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body?.trim() ?? "",
    publishedAt: update.date ?? null,
    errorMessage: "",
    downloadedBytes: 0,
    totalBytes: 0,
    pendingUpdate: update,
  });
}

function setManualStatusDialog(
  phase: Extract<AppUpdatePhase, "up-to-date" | "unsupported" | "error">,
  errorMessage = "",
) {
  const previous = useAppUpdateStore.getState().pendingUpdate;
  if (previous) {
    void releasePendingUpdate(previous);
  }

  updateDialogState({
    open: true,
    phase,
    version: null,
    currentVersion: null,
    notes: "",
    publishedAt: null,
    errorMessage,
    downloadedBytes: 0,
    totalBytes: 0,
    pendingUpdate: null,
  });
}

async function runUpdateCheck(manual: boolean) {
  if (!isTauri()) {
    if (manual) {
      setManualStatusDialog("unsupported");
    }
    return;
  }

  try {
    const update = await check();

    if (!update) {
      if (manual) {
        setManualStatusDialog("up-to-date");
      }
      return;
    }

    setAvailableUpdate(update);
  } catch (error) {
    if (manual) {
      setManualStatusDialog(
        "error",
        i18n.t("errors.updateCheckFailed", { error: String(error) }),
      );
    }
  }
}

export async function installAppUpdate() {
  const state = useAppUpdateStore.getState();
  const update = state.pendingUpdate;

  if (!update) {
    return;
  }

  let downloadedBytes = 0;
  let totalBytes = 0;

  updateDialogState({
    open: true,
    phase: "downloading",
    errorMessage: "",
    downloadedBytes,
    totalBytes,
  });

  try {
    await update.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case "Started":
          totalBytes = event.data.contentLength ?? 0;
          updateDialogState({
            phase: "downloading",
            downloadedBytes,
            totalBytes,
          });
          break;
        case "Progress":
          downloadedBytes += event.data.chunkLength;
          updateDialogState({
            phase: "downloading",
            downloadedBytes,
            totalBytes,
          });
          break;
        case "Finished":
          updateDialogState({
            phase: "installing",
            downloadedBytes,
            totalBytes,
          });
          break;
        default: {
          const exhaustiveCheck: never = event;
          return exhaustiveCheck;
        }
      }
    });

    await releasePendingUpdate(update);

    updateDialogState({
      open: true,
      phase: "installed",
      pendingUpdate: null,
      errorMessage: "",
      downloadedBytes: totalBytes || downloadedBytes,
      totalBytes,
    });
  } catch (error) {
    await releasePendingUpdate(update);

    updateDialogState({
      open: true,
      phase: "error",
      pendingUpdate: null,
      errorMessage: i18n.t("errors.updateInstallFailed", {
        error: String(error),
      }),
    });
  }
}

export function dismissAppUpdateDialog() {
  const state = useAppUpdateStore.getState();

  if (state.phase === "downloading" || state.phase === "installing") {
    return;
  }

  if (state.pendingUpdate) {
    void releasePendingUpdate(state.pendingUpdate);
  }

  state.resetDialog();
}

export async function restartToApplyAppUpdate() {
  try {
    await relaunch();
  } catch (error) {
    updateDialogState({
      open: true,
      phase: "error",
      pendingUpdate: null,
      errorMessage: i18n.t("errors.restartFailed", { error: String(error) }),
    });
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
