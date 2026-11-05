import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkflowScope } from "@/lib/change-workflow-ui/scope";
import { isHubPath } from "@/lib/hub/store";
import { Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentEvidencePanel } from "./agent-evidence";
import { ChangeMap } from "./change-map";
import { InitiativesPanel } from "./initiatives";

/** Tools-panel host for the architecture map (71), agent evidence (74) and multi-repo initiatives (75). Local repositories only. */
export function ChangeWorkflowPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const scope = useWorkflowScope(path);
  if (isHubPath(path)) return null;
  return (
    <section className="space-y-2 px-4 pb-4" aria-labelledby="cw-title">
      <h3 id="cw-title" className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Workflow className="size-3.5" />
        {t("changeMap.panelTitle")}
      </h3>
      <Tabs defaultValue="map">
        <TabsList className="h-7">
          <TabsTrigger value="map" className="text-xs">{t("changeMap.tab")}</TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs">{t("agentEvidence.tab")}</TabsTrigger>
          <TabsTrigger value="initiatives" className="text-xs">{t("changeInitiative.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="map" className="pt-2"><ChangeMap path={path} /></TabsContent>
        <TabsContent value="evidence" className="pt-2">
          {scope ? <AgentEvidencePanel path={path} scope={scope} /> : <p role="status" className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.loadingScope")}</p>}
        </TabsContent>
        <TabsContent value="initiatives" className="pt-2">
          {scope ? <InitiativesPanel scope={scope} /> : <p role="status" className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.loadingScope")}</p>}
        </TabsContent>
      </Tabs>
    </section>
  );
}
