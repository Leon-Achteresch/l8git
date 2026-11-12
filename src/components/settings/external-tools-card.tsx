import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpinIcon } from "@/components/motion/kit";
import { toastError } from "@/lib/error-toast";
import {
  loadExternalToolSettings,
  setExternalTool,
  type ExternalToolSettings,
  type ToolOption,
} from "@/lib/external-tools";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Radix Select forbids an empty item value.
const NONE = "__none__";

function ToolSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: ToolOption[];
  disabled: boolean;
  onChange: (tool: string | null) => void;
}) {
  const { t } = useTranslation();
  // A configured tool git does not list (e.g. set by hand) must still show.
  const all =
    value && !options.some((o) => o.name === value)
      ? [{ name: value, available: true }, ...options]
      : options;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? NONE}
        disabled={disabled}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger id={id} size="sm" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("externalTools.notSet")}</SelectItem>
          {all.map((o) => (
            <SelectItem key={o.name} value={o.name}>
              {o.available ? o.name : t("externalTools.notInstalled", { tool: o.name })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ExternalToolsCard() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ExternalToolSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadExternalToolSettings()
      .then((next) => alive && setInfo(next))
      .catch((err) => alive && toastError(String(err)));
    return () => {
      alive = false;
    };
  }, []);

  async function apply(kind: "diff" | "merge", tool: string | null) {
    if (!info || saving) return;
    setSaving(true);
    try {
      await setExternalTool(kind, tool);
      setInfo(kind === "diff" ? { ...info, diffTool: tool } : { ...info, mergeTool: tool });
      toast.success(t("externalTools.saved"));
    } catch (err) {
      toastError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("externalTools.title")}</CardTitle>
        <CardDescription>{t("externalTools.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!info ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <SpinIcon icon={Loader2} className="size-3.5" aria-hidden />
            {t("externalTools.loading")}
          </p>
        ) : (
          <>
            <ToolSelect
              id="external-diff-tool"
              label={t("externalTools.diffLabel")}
              value={info.diffTool}
              options={info.diffTools}
              disabled={saving}
              onChange={(tool) => void apply("diff", tool)}
            />
            <ToolSelect
              id="external-merge-tool"
              label={t("externalTools.mergeLabel")}
              value={info.mergeTool}
              options={info.mergeTools}
              disabled={saving}
              onChange={(tool) => void apply("merge", tool)}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("externalTools.hint")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
