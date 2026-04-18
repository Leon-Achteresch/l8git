import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function CommitInspectHeader({
  onRefresh,
  loading,
}: {
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-muted/10 px-4 py-3 backdrop-blur-md">
      <span className="text-sm font-semibold tracking-tight text-foreground/80">
        Commit-Details
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full transition-colors hover:bg-primary/10 hover:text-primary"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCw
          className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`}
        />
      </Button>
    </div>
  );
}
