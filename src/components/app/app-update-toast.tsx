import { Button } from "@/components/ui/button";
import {
  checkForAppUpdate,
  dismissAppUpdateDialog,
  hideAppUpdateToast,
  installAppUpdate,
  restartToApplyAppUpdate,
  useAppUpdateStore,
} from "@/lib/app-updater";
import { ArrowDownToLine, Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

export function AppUpdateToast() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const open = useAppUpdateStore((s) => s.open);
  const phase = useAppUpdateStore((s) => s.phase);
  const version = useAppUpdateStore((s) => s.version);
  const downloadedBytes = useAppUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useAppUpdateStore((s) => s.totalBytes);

  const busy = phase === "downloading" || phase === "installing";

  const percent =
    totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null;

  const visible = open && phase !== "idle" && phase !== "up-to-date" && phase !== "unsupported";

  function handleInfo() {
    void navigate({ to: "/changelog" });
    hideAppUpdateToast();
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="update-toast"
          role="status"
          aria-live="polite"
          aria-label={t("updates.toastAria")}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
          className="fixed bottom-4 left-4 z-[200] w-[320px] overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Progress bar for downloading */}
          {(phase === "downloading" || phase === "installing") && (
            <div className="h-[2px] w-full bg-muted">
              {percent !== null ? (
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <div className="h-full w-2/5 animate-pulse bg-primary/70" />
              )}
            </div>
          )}

          <div className="flex items-start gap-3 p-3.5">
            {/* Icon */}
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
              {phase === "downloading" || phase === "installing" ? (
                <Download className="size-4" />
              ) : phase === "installed" ? (
                <RefreshCw className="size-4" />
              ) : (
                <ArrowDownToLine className="size-4" />
              )}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-foreground">
                {phase === "available"
                  ? version
                    ? t("updates.titleAvailable", { version })
                    : t("updates.titleAvailableShort")
                  : phase === "downloading"
                    ? t("updates.toastDownloading", {
                        percent: percent !== null ? `${percent}%` : "…",
                      })
                    : phase === "installing"
                      ? t("updates.titleInstallingShort")
                      : phase === "installed"
                        ? version
                          ? t("updates.titleInstalled", { version })
                          : t("updates.titleInstalledShort")
                        : phase === "error"
                          ? t("updates.titleError")
                          : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {phase === "available"
                  ? t("updates.toastSubAvailable")
                  : phase === "downloading" || phase === "installing"
                    ? t("updates.toastSubProgress")
                    : phase === "installed"
                      ? t("updates.toastSubInstalled")
                      : phase === "error"
                        ? t("updates.descError")
                        : ""}
              </p>
            </div>

            {/* Close */}
            {!busy && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-mr-1 -mt-1 shrink-0"
                onClick={() => dismissAppUpdateDialog()}
                aria-label={t("updates.close")}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 border-t border-border/50 px-3.5 py-2.5">
            {phase === "available" && (
              <>
                <button
                  type="button"
                  onClick={handleInfo}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  {t("updates.toastInfo")}
                </button>
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => dismissAppUpdateDialog()}
                >
                  {t("common.later")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => void installAppUpdate()}
                >
                  <ArrowDownToLine className="size-3" />
                  {t("updates.toastInstallNow")}
                </Button>
              </>
            )}

            {phase === "installed" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => dismissAppUpdateDialog()}
                >
                  {t("common.later")}
                </Button>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => void restartToApplyAppUpdate()}
                >
                  <RefreshCw className="size-3" />
                  {t("updates.restartNow")}
                </Button>
              </>
            )}

            {phase === "error" && (
              <>
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => void checkForAppUpdate({ manual: true })}
                >
                  <RefreshCw className="size-3" />
                  {t("common.retryCheck")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => dismissAppUpdateDialog()}
                >
                  {t("updates.close")}
                </Button>
              </>
            )}

            {(phase === "downloading" || phase === "installing") && (
              <p className="flex-1 text-xs text-muted-foreground">
                {t("updates.toastSubProgress")}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
