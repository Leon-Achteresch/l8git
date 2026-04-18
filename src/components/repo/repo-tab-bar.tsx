import { useRepoStore, repoLabel } from "@/lib/repo-store";
import { RepoTab } from "./repo-tab";
import { AddRepoButton } from "./add-repo-button";

export function RepoTabBar() {
  const paths = useRepoStore((s) => s.paths);
  const activePath = useRepoStore((s) => s.activePath);
  const loading = useRepoStore((s) => s.loading);
  const favicons = useRepoStore((s) => s.favicons);
  const setActive = useRepoStore((s) => s.setActive);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const reload = useRepoStore((s) => s.reload);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b">
      {paths.map((p) => (
        <RepoTab
          key={p}
          path={p}
          label={repoLabel(p)}
          active={p === activePath}
          loading={!!loading[p]}
          favicon={favicons[p]}
          onSelect={() => setActive(p)}
          onClose={() => removeRepo(p)}
          onReload={() => void reload(p)}
        />
      ))}
      <AddRepoButton />
    </div>
  );
}
