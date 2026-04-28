import { useRepoStore } from "@/lib/repo-store";
import { useEffect, useState } from "react";
import { SubmoduleAddDialog } from "./submodule-add-dialog";
import { SubmoduleList } from "./submodule-list";

export function SubmodulesPanel({ path }: { path: string }) {
  const reloadSubmodules = useRepoStore((s) => s.reloadSubmodules);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    void reloadSubmodules(path);
  }, [path, reloadSubmodules]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SubmoduleList path={path} onOpenAdd={() => setAddOpen(true)} />
      <SubmoduleAddDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        path={path}
      />
    </div>
  );
}
