import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCommitPrefs, type DiffLayoutMode } from "@/lib/commit-prefs";
import { Columns2, Rows2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DiffLayoutToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const layoutMode = useCommitPrefs((s) => s.diffLayoutMode);
  const setLayoutMode = useCommitPrefs((s) => s.setDiffLayoutMode);

  return (
    <ToggleGroup
      type="single"
      value={layoutMode}
      onValueChange={(value) => value && setLayoutMode(value as DiffLayoutMode)}
      variant="outline"
      size="sm"
      className={className}
    >
      <ToggleGroupItem
        value="inline"
        aria-label={t("diff.layoutInline")}
        title={t("diff.layoutInlineTitle")}
      >
        <Rows2 />
        {t("diff.layoutInline")}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="sideBySide"
        aria-label={t("diff.layoutSideBySide")}
        title={t("diff.layoutSideBySideTitle")}
      >
        <Columns2 />
        {t("diff.layoutSideBySide")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
