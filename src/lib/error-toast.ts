import { toast } from "sonner";

import i18n from "@/lib/i18n";

export function toastError(message: string) {
  const devCopy =
    import.meta.env.DEV
      ? {
          action: {
            label: i18n.t("errors.copyAction"),
            onClick: () => {
              void navigator.clipboard.writeText(message);
            },
          },
        }
      : {};
  toast.error(message, devCopy);
}
