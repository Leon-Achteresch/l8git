import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import {
  SIGNING_FORMATS,
  applySigningConfig,
  loadSigningInfo,
  normalizeSigningFormat,
  signingFormatLabel,
  type SigningFormat,
  type SigningInfo,
  type SigningScope,
} from "@/lib/git-signing";
import { useRepoStore } from "@/lib/repo-store";
import { notifySigningChanged } from "@/lib/signing-store";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function scopeSummary(scope: SigningScope, fallback: string): string {
  const parts = [
    scope.commitSign === null ? null : `commit.gpgsign=${scope.commitSign}`,
    scope.tagSign === null ? null : `tag.gpgsign=${scope.tagSign}`,
    scope.format ? `gpg.format=${scope.format}` : null,
    scope.signingKey ? `user.signingkey=${scope.signingKey}` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : fallback;
}

export function GitSigningCard() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const [info, setInfo] = useState<SigningInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  useEffect(() => {
    if (!activePath) {
      setInfo(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void loadSigningInfo(activePath)
      .then((next) => {
        if (!alive) return;
        setInfo(next);
        setKeyDraft(next.signingKey ?? "");
      })
      .catch(() => {
        if (alive) setInfo(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activePath]);

  async function apply(patch: {
    commitSign?: boolean;
    tagSign?: boolean;
    format?: string;
    signingKey?: string;
  }) {
    if (!activePath || saving) return;
    setSaving(true);
    try {
      const next = await applySigningConfig(activePath, patch);
      setInfo(next);
      setKeyDraft(next.signingKey ?? "");
      notifySigningChanged();
      toast.success(t("settings.signingSaved"));
    } catch (err) {
      toastError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const format: SigningFormat = normalizeSigningFormat(info?.format);
  const keyDirty = (info?.signingKey ?? "") !== keyDraft.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.signingTitle")}</CardTitle>
        <CardDescription>{t("settings.signingDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!activePath && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("settings.signingNoRepo")}
          </p>
        )}

        {activePath && loading && !info && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("settings.signingLoading")}
          </p>
        )}

        {activePath && info && (
          <>
            <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground/80">
                  {t("settings.signingScopeGlobal")}
                </span>{" "}
                {scopeSummary(info.global, t("settings.signingScopeEmpty"))}
              </p>
              <p>
                <span className="font-medium text-foreground/80">
                  {t("settings.signingScopeLocal")}
                </span>{" "}
                {scopeSummary(info.local, t("settings.signingScopeEmpty"))}
              </p>
              <p
                className={cn(
                  "flex items-center gap-1.5 pt-1",
                  info.toolAvailable ? "text-git-added" : "text-git-modified",
                )}
              >
                {info.toolAvailable ? (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                ) : (
                  <TriangleAlert className="size-3.5" aria-hidden />
                )}
                {info.toolAvailable
                  ? t("settings.signingToolReady", {
                      program: info.program,
                      version: info.toolVersion ?? "",
                    })
                  : t("settings.signingToolMissing", { program: info.program })}
              </p>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="signing-commit"
                checked={info.commitSign}
                disabled={saving}
                onCheckedChange={(v) => void apply({ commitSign: v === true })}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="signing-commit"
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  {t("settings.signingCommitLabel")}
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.signingCommitHint")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="signing-tag"
                checked={info.tagSign}
                disabled={saving}
                onCheckedChange={(v) => void apply({ tagSign: v === true })}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="signing-tag"
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  {t("settings.signingTagLabel")}
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.signingTagHint")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("settings.signingFormatLabel")}</Label>
              <div
                role="radiogroup"
                aria-label={t("settings.signingFormatLabel")}
                className="inline-flex gap-1 rounded-lg bg-muted/50 p-1"
              >
                {SIGNING_FORMATS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={format === option}
                    disabled={saving}
                    onClick={() => void apply({ format: option })}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      format === option
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {signingFormatLabel(option)}
                  </button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("settings.signingFormatHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signing-key">{t("settings.signingKeyLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="signing-key"
                  value={keyDraft}
                  spellCheck={false}
                  disabled={saving}
                  placeholder={
                    format === "ssh"
                      ? t("settings.signingKeyPlaceholderSsh")
                      : t("settings.signingKeyPlaceholderGpg")
                  }
                  onChange={(e) => setKeyDraft(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  disabled={saving || !keyDirty}
                  onClick={() => void apply({ signingKey: keyDraft.trim() })}
                >
                  {t("common.save")}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("settings.signingKeyHint")}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
