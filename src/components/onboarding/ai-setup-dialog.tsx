import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListRow } from "@/components/ui/list-row";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AI_PROVIDER_DEFAULT_MODELS,
  useCommitPrefs,
  type AiProviderType,
} from "@/lib/commit-prefs";
import {
  detectOllamaModels,
  OLLAMA_DEFAULT_BASE_URL,
} from "@/lib/ai-setup";
import { cn } from "@/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { Bot, Brain, Globe2, HardDrive, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SpinIcon } from "@/components/motion/kit";

const SETUP_PROVIDERS = [
  { id: "ollama" as const, label: "Ollama", icon: HardDrive },
  { id: "openai" as const, label: "OpenAI", icon: Bot },
  { id: "anthropic" as const, label: "Anthropic", icon: Brain },
  { id: "google" as const, label: "Google", icon: Sparkles },
  { id: "openrouter" as const, label: "OpenRouter", icon: Globe2 },
] satisfies { id: AiProviderType; label: string; icon: typeof Bot }[];

export function AiSetupDialog({
  open,
  onOpenChange,
  onReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const setAiProviderType = useCommitPrefs((s) => s.setAiProviderType);
  const setAiProviderApiKey = useCommitPrefs((s) => s.setAiProviderApiKey);
  const setAiProviderModel = useCommitPrefs((s) => s.setAiProviderModel);
  const setAiProviderBaseUrl = useCommitPrefs((s) => s.setAiProviderBaseUrl);

  const [provider, setProvider] = useState<AiProviderType>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setApiKey("");
    setModel("");
    setOllamaModels(null);
    setProbing(true);
    setProvider(useCommitPrefs.getState().aiProviderType);
    void detectOllamaModels().then((models) => {
      if (cancelled) return;
      setProbing(false);
      if (!models) return;
      setOllamaModels(models);
      setProvider("ollama");
      setModel(models[0] ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const ollamaReachable = ollamaModels !== null;
  const needsKey = provider !== "ollama";
  const canSave = !saving && (!needsKey || apiKey.trim().length > 0);

  const providers = ollamaReachable
    ? SETUP_PROVIDERS
    : [...SETUP_PROVIDERS.filter((p) => p.id !== "ollama"), SETUP_PROVIDERS[0]];

  const save = async () => {
    setSaving(true);
    const trimmedKey = apiKey.trim();
    setAiProviderType(provider);
    setAiProviderModel(model.trim());
    if (provider === "ollama") {
      setAiProviderBaseUrl(OLLAMA_DEFAULT_BASE_URL);
      setAiProviderApiKey("");
    } else {
      setAiProviderApiKey(trimmedKey);
    }
    try {
      const { secureSet, secureDelete, AI_KEY_KEYRING_KEY } = await import(
        "@/lib/secure-storage"
      );
      if (provider !== "ollama" && trimmedKey) {
        await secureSet(AI_KEY_KEYRING_KEY, trimmedKey);
      } else if (provider === "ollama") {
        await secureDelete(AI_KEY_KEYRING_KEY);
      }
    } catch {
      setSaving(false);
    }
    setSaving(false);
    onOpenChange(false);
    onReady();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("aiSetup.title")}</DialogTitle>
          <DialogDescription>{t("aiSetup.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            role="radiogroup"
            aria-label={t("aiSetup.providerLabel")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {providers.map(({ id, label, icon: Icon }) => {
              const active = provider === id;
              const isOllama = id === "ollama";
              return (
                <ListRow
                  key={id}
                  variant="card"
                  role="radio"
                  aria-checked={active}
                  active={active}
                  onClick={() => {
                    setProvider(id);
                    setModel(isOllama ? (ollamaModels?.[0] ?? "") : "");
                  }}
                  className="flex-col items-start gap-1.5 p-3"
                >
                  <Icon
                    className={cn(
                      "size-4",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="text-xs font-semibold">{label}</div>
                  {isOllama && (
                    <div className="text-[10px] text-muted-foreground">
                      {ollamaReachable
                        ? t("aiSetup.ollamaReady")
                        : t("aiSetup.ollamaOffline")}
                    </div>
                  )}
                </ListRow>
              );
            })}
          </div>

          {probing && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SpinIcon icon={Loader2} className="size-3" />
              {t("aiSetup.probing")}
            </p>
          )}

          {needsKey ? (
            <div className="space-y-1.5">
              <Label htmlFor="ai-setup-key" className="text-sm font-medium">
                {t("aiSetup.keyLabel")}
              </Label>
              <Input
                id="ai-setup-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t("aiSetup.keyPlaceholder")}
                className="font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{t("aiSetup.keyHint")}</p>
            </div>
          ) : ollamaModels && ollamaModels.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="ai-setup-model" className="text-sm font-medium">
                {t("aiSetup.modelLabel")}
              </Label>
              <NativeSelect
                id="ai-setup-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {ollamaModels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="ai-setup-model" className="text-sm font-medium">
                {t("aiSetup.modelLabel")}
              </Label>
              <Input
                id="ai-setup-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={AI_PROVIDER_DEFAULT_MODELS[provider]}
                className="font-mono text-sm"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {t("aiSetup.ollamaHint")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              void router.navigate({ to: "/settings", hash: "ai" });
            }}
          >
            {t("aiSetup.openSettings")}
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void save()}>
            {saving && <SpinIcon icon={Loader2} className="size-3.5" />}
            {t("aiSetup.saveAndGenerate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
