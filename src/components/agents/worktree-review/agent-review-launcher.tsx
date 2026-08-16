import { FileDiff } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { AgentReviewDialog } from "./agent-review-dialog";

export function AgentReviewButton({
  worktreePath,
  basePath,
  branch = null,
  variant = "outline",
  size = "sm",
  className,
}: {
  worktreePath: string;
  basePath: string;
  branch?: string | null;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const session = useMemo(
    () => ({ worktreePath, basePath, branch }),
    [worktreePath, basePath, branch],
  );

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <FileDiff />
        {t("agentReview.openButton")}
      </Button>
      {open ? (
        <AgentReviewDialog open={open} onOpenChange={setOpen} session={session} />
      ) : null}
    </>
  );
}
