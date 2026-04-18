import { toast } from "sonner";

export function toastError(message: string) {
  const devCopy =
    import.meta.env.DEV
      ? {
          action: {
            label: "Kopieren",
            onClick: () => {
              void navigator.clipboard.writeText(message);
            },
          },
        }
      : {};
  toast.error(message, devCopy);
}
