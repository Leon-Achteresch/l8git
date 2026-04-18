import { Plus } from "lucide-react";
import { usePickRepo } from "@/lib/use-pick-repo";

export function AddRepoButton() {
  const pickRepo = usePickRepo();
  return (
    <button
      type="button"
      onClick={() => void pickRepo()}
      title="Repository hinzufügen"
      aria-label="Repository hinzufügen"
      className="inline-flex h-9 items-center justify-center rounded-t-md px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
