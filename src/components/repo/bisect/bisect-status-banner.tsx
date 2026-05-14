import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { AlertTriangle, CheckCircle2, CircleDot, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

export function BisectStatusBanner({ path }: { path: string }) {
  const bisect = useRepoStore(s => s.bisect[path]);
  const bisectReset = useRepoStore(s => s.bisectReset);
  const bisectVisible = useUiStore(s => s.bisectVisible);
  const bisectPending = useUiStore(s => s.bisectPending[path]);

  if (!bisectVisible) return null;

  const hasPendingBad = !!bisectPending?.bad;
  const hasPendingGood = !!bisectPending?.good;
  const showPending = !bisect?.active && (hasPendingBad || hasPendingGood);

  if (!bisect?.active && !showPending) return null;

  async function handleReset() {
    try {
      await bisectReset(path);
      toast.success("Bisect beendet.");
    } catch {
      // error handled in store
    }
  }

  if (bisect?.done) {
    return (
      <div className="flex items-center gap-2 border-b border-orange-200 bg-orange-50 px-3 py-2 text-xs dark:border-orange-900/40 dark:bg-orange-950/30">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="font-medium text-orange-800 dark:text-orange-300">
          Erstes fehlerhaftes Commit gefunden:
        </span>
        <code className="font-mono text-orange-700 dark:text-orange-400">
          {bisect.result_hash?.slice(0, 8)}
        </code>
        {bisect.result_subject && (
          <span className="min-w-0 flex-1 truncate text-orange-700/80 dark:text-orange-400/80">
            {bisect.result_subject}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs text-orange-700 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/40"
          onClick={() => void handleReset()}
        >
          <RotateCcw className="h-3 w-3" />
          Beenden
        </Button>
      </div>
    );
  }

  if (bisect?.active) {
    return (
      <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-2 text-xs dark:border-blue-900/40 dark:bg-blue-950/30">
        <CircleDot className="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-500" />
        <span className="font-medium text-blue-800 dark:text-blue-300">Bisect läuft</span>
        {bisect.steps_remaining != null && (
          <span className="text-blue-700/70 dark:text-blue-400/70">
            · ~{bisect.steps_remaining} {bisect.steps_remaining === 1 ? "Schritt" : "Schritte"} verbleibend
          </span>
        )}
        {bisect.current_subject && (
          <span className="min-w-0 flex-1 truncate text-blue-700/70 dark:text-blue-400/70">
            · {bisect.current_subject}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs text-blue-700 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40"
          onClick={() => void handleReset()}
        >
          <RotateCcw className="h-3 w-3" />
          Beenden
        </Button>
      </div>
    );
  }

  // Pending state (bisect not started yet, waiting for second commit)
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
      {hasPendingBad ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
      )}
      <span className="text-muted-foreground">
        Bisect:{" "}
        {hasPendingBad && !hasPendingGood
          ? "'Bad' commit gesetzt — Rechtsklick auf einen älteren Commit um 'Good' zu markieren."
          : "'Good' commit gesetzt — Rechtsklick auf einen neueren Commit um 'Bad' zu markieren."}
      </span>
    </div>
  );
}
