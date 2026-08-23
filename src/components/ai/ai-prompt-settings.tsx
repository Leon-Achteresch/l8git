import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiPromptPrefs } from "@/lib/ai/prompt-prefs";
import {
  AI_FEATURES,
  AI_PROMPT_TEMPLATES,
  defaultPromptTemplate,
  type AiFeature,
} from "@/lib/ai/prompts";

function FeaturePromptEditor({ feature }: { feature: AiFeature }) {
  const { t } = useTranslation();
  const def = AI_PROMPT_TEMPLATES[feature];
  const override = useAiPromptPrefs((s) => s.overrides[feature]);
  const setTemplate = useAiPromptPrefs((s) => s.setTemplate);
  const resetTemplate = useAiPromptPrefs((s) => s.resetTemplate);

  const stored = override ?? "";
  const [draft, setDraft] = useState(stored || defaultPromptTemplate(feature));

  useEffect(() => {
    setDraft(override?.trim() ? override : defaultPromptTemplate(feature));
  }, [override, feature]);

  const customized = !!override?.trim();
  const dirty = draft !== (customized ? override : defaultPromptTemplate(feature));

  return (
    <AccordionItem value={feature} className="border-b last:border-b-0">
      <AccordionTrigger>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{t(def.labelKey)}</span>
          {customized ? (
            <Badge variant="secondary" className="shrink-0">
              {t("settings.aiPromptCustomized")}
            </Badge>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t(def.descriptionKey)}</p>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="min-h-[200px] font-mono text-xs"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("settings.aiPromptPlaceholders")}
          </span>
          {def.placeholders.map((name) => (
            <code
              key={name}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground"
            >
              {`{{${name}}}`}
            </code>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customized && !dirty}
            onClick={() => {
              resetTemplate(feature);
              setDraft(defaultPromptTemplate(feature));
            }}
          >
            <RotateCcw className="size-3.5" />
            {t("settings.aiPromptReset")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty}
            onClick={() => setTemplate(feature, draft)}
          >
            {t("common.save")}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function AiPromptSettings() {
  return (
    <Accordion type="multiple" className="rounded-lg border px-3">
      {AI_FEATURES.map((feature) => (
        <FeaturePromptEditor key={feature} feature={feature} />
      ))}
    </Accordion>
  );
}
