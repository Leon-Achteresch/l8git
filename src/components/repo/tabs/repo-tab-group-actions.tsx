import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  groupIdOfPath,
  listGroups,
  useRepoGroupsStore,
} from "@/lib/repo-groups-store";
import { FolderInput, FolderPlus, Ungroup } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function RepoTabGroupActions({
  path,
  onCreateGroup,
}: {
  path: string;
  onCreateGroup: () => void;
}) {
  const { t } = useTranslation();
  const forest = useRepoGroupsStore((s) => s.forest);
  const addToGroup = useRepoGroupsStore((s) => s.addToGroup);
  const removeFromGroup = useRepoGroupsStore((s) => s.removeFromGroup);

  const currentGroupId = useMemo(
    () => groupIdOfPath(forest, path),
    [forest, path],
  );
  const groups = useMemo(() => listGroups(forest), [forest]);

  const moveTargets = groups.filter((g) => g.id !== currentGroupId);

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onCreateGroup}>
        <FolderPlus className="h-3.5 w-3.5" />
        {t("repoGroup.createFromRepo")}
      </ContextMenuItem>

      {moveTargets.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="h-3.5 w-3.5" />
            {t("repoGroup.moveToGroup")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-64 overflow-y-auto">
            {moveTargets.map((g) => (
              <ContextMenuItem
                key={g.id}
                onSelect={() => addToGroup(path, g.id)}
                style={{ paddingLeft: `${0.5 + g.depth * 0.75}rem` }}
              >
                <span
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: `hsl(${g.hue} 55% 50%)` }}
                  aria-hidden
                />
                <span className="truncate">{g.name}</span>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {currentGroupId !== null && (
        <ContextMenuItem onSelect={() => removeFromGroup(path)}>
          <Ungroup className="h-3.5 w-3.5" />
          {t("repoGroup.removeFromGroup")}
        </ContextMenuItem>
      )}
    </>
  );
}
