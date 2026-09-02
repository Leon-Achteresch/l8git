import { PictureInPicture2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IS_TAURI } from "@/lib/island/bridge";
import { minimizeMainWindow } from "@/lib/island/window-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { cn } from "@/lib/utils";

/**
 * Sends l8git to the background while keeping the island on screen: the island
 * detaches into its own always-on-top window, then the main window minimizes.
 */
export function MinimizeToIsland() {
  const { t } = useTranslation();
  const islandEnabled = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  if (!IS_TAURI || !islandEnabled) return null;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("header.minimizeToIsland")}
      title={t("header.minimizeToIsland")}
      onClick={() => {
        void minimizeMainWindow().catch(() =>
          toast.error(t("header.minimizeToIslandFailed")),
        );
      }}
      className={cn(
        "size-7 text-muted-foreground",
        "hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      <PictureInPicture2 className="size-4" strokeWidth={2} />
    </Button>
  );
}
