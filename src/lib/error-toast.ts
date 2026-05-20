import { toast } from "sonner";

import i18n from "@/lib/i18n";

function translateKnownError(message: string): string {
  const markerIdx = message.indexOf("__LOCAL_CHANGES_BLOCK__|");
  if (markerIdx >= 0) {
    const payload = message.slice(markerIdx + "__LOCAL_CHANGES_BLOCK__|".length);
    const files = payload
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    return i18n.t("errors.localChangesBlockPull", { files: files.join(", ") });
  }
  return message;
}

export function toastError(message: string) {
  const display = translateKnownError(message);
  void navigator.clipboard.writeText(display).catch(() => {});
  toast.error(display, {
    action: {
      label: i18n.t("errors.copyAction"),
      onClick: () => {
        void navigator.clipboard.writeText(display);
      },
    },
  });
}
