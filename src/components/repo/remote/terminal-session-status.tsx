import { Button } from "@/components/ui/button";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, m } from "motion/react";

type Status = "ready" | "exited" | "error";

interface Props {
  status: Status;
  label: string;
  reopenLabel: string;
  onReopen: () => void;
}

export function TerminalSessionStatus({
  status,
  label,
  reopenLabel,
  onReopen,
}: Props) {
  const visible = status === "error" || status === "exited";
  const isError = status === "error";

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <m.div
          key={status}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_PANEL}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "flex items-center gap-2 border-b px-3.5 py-2 text-xs",
              isError
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : "border-border/40 bg-muted/40 text-muted-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onReopen}
              className={cn(
                "h-auto shrink-0 rounded-full px-2 py-0.5 font-medium",
                isError
                  ? "bg-destructive/15 hover:bg-destructive/25"
                  : "bg-foreground/5 hover:bg-foreground/10",
              )}
            >
              <RotateCcw className="size-3" />
              {reopenLabel}
            </Button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
