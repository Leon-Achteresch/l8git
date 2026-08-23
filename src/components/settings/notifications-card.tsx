import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  NOTIFICATION_KINDS,
  ensureNotificationPermission,
  refreshNotificationPermission,
  useNotificationPermission,
  useNotificationPrefs,
  type NotificationKind,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const KIND_LABELS: Record<NotificationKind, { label: string; hint: string }> = {
  ciFailed: { label: "notifications.kindCiFailedLabel", hint: "notifications.kindCiFailedHint" },
  reviewRequested: {
    label: "notifications.kindReviewRequestedLabel",
    hint: "notifications.kindReviewRequestedHint",
  },
  agentTurn: {
    label: "notifications.kindAgentTurnLabel",
    hint: "notifications.kindAgentTurnHint",
  },
  remoteOpDone: {
    label: "notifications.kindRemoteOpDoneLabel",
    hint: "notifications.kindRemoteOpDoneHint",
  },
};

export function NotificationsCard() {
  const { t } = useTranslation();
  const enabled = useNotificationPrefs((s) => s.enabled);
  const kinds = useNotificationPrefs((s) => s.kinds);
  const setEnabled = useNotificationPrefs((s) => s.setEnabled);
  const setKind = useNotificationPrefs((s) => s.setKind);
  const permission = useNotificationPermission((s) => s.status);

  useEffect(() => {
    void refreshNotificationPermission();
  }, []);

  const permissionText =
    permission === "granted"
      ? t("notifications.permissionGranted")
      : permission === "denied"
        ? t("notifications.permissionDenied")
        : t("notifications.permissionUnknown");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notifications.title")}</CardTitle>
        <CardDescription>{t("notifications.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="notifications-enabled"
            checked={enabled}
            onCheckedChange={(v) => {
              const next = v === true;
              setEnabled(next);
              if (next) void ensureNotificationPermission();
            }}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="notifications-enabled"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {t("notifications.enableLabel")}
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("notifications.enableHint")}
            </p>
          </div>
        </div>

        <div className={cn("space-y-4 pl-7", !enabled && "pointer-events-none opacity-50")}>
          {NOTIFICATION_KINDS.map((kind) => (
            <div key={kind} className="flex items-start gap-3">
              <Checkbox
                id={`notifications-${kind}`}
                checked={kinds[kind]}
                disabled={!enabled}
                onCheckedChange={(v) => setKind(kind, v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor={`notifications-${kind}`}
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  {t(KIND_LABELS[kind].label)}
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(KIND_LABELS[kind].hint)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {t("notifications.permissionLabel")}
            </p>
            <p
              className={cn(
                "text-xs leading-relaxed",
                permission === "granted" ? "text-git-added" : "text-muted-foreground",
              )}
            >
              {permissionText}
            </p>
          </div>
          {permission !== "granted" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void ensureNotificationPermission()}
            >
              {t("notifications.permissionRequest")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
