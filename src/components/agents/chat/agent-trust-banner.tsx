import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setRepoAgentsTrusted, useAgentTrustPrefs } from "@/lib/agent-trust-prefs";

function repoKey(path: string): string {
  return path.trim().replace(/[/\\]+$/, "");
}

export function AgentTrustBanner({ path }: { path: string }) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const trusted = useAgentTrustPrefs((state) => state.trustedByRepo[repoKey(path)] === true);

  if (!path || trusted) return null;

  return (
    <AgentsEnter>
    <div className="ag-card mt-2 flex w-full items-start gap-2.5 border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[12px]">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("agentTrust.bannerTitle")}</p>
        <p className="ag-muted mt-0.5">{t("agentTrust.bannerBody")}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 self-center"
        onClick={() => setConfirmOpen(true)}
      >
        {t("agentTrust.trustAction")}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agentTrust.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("agentTrust.confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("agentTrust.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRepoAgentsTrusted(path, true);
                setConfirmOpen(false);
              }}
            >
              {t("agentTrust.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </AgentsEnter>
  );
}
