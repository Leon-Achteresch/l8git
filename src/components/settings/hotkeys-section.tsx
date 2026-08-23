import { formatForDisplay, useHotkeyRecorder } from "@tanstack/react-hotkeys";
import { AlertTriangle, Keyboard, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HOTKEY_ACTIONS,
  HOTKEY_ACTION_GROUPS,
  HOTKEY_DEFAULTS,
  computeHotkeyConflicts,
  useHotkeyBindings,
  useHotkeyPrefs,
  type HotkeyActionId,
} from "@/lib/hotkey-prefs";
import { cn } from "@/lib/utils";

export function HotkeysSection() {
  const { t } = useTranslation();
  const bindings = useHotkeyBindings();
  const overrides = useHotkeyPrefs((s) => s.overrides);
  const setBinding = useHotkeyPrefs((s) => s.setBinding);
  const resetBinding = useHotkeyPrefs((s) => s.resetBinding);
  const resetAll = useHotkeyPrefs((s) => s.resetAll);
  const [recordingId, setRecordingId] = useState<HotkeyActionId | null>(null);

  const conflicts = useMemo(
    () => computeHotkeyConflicts(bindings),
    [bindings],
  );

  const labelOf = useCallback(
    (id: HotkeyActionId) => {
      const def = HOTKEY_ACTIONS.find((a) => a.id === id);
      if (!def) return id;
      return t(def.labelKey, def.labelParams ?? {});
    },
    [t],
  );

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (recordingId) setBinding(recordingId, hotkey);
      setRecordingId(null);
    },
    onCancel: () => setRecordingId(null),
    onClear: () => {
      if (recordingId) resetBinding(recordingId);
      setRecordingId(null);
    },
  });

  const startRecording = useCallback(
    (id: HotkeyActionId) => {
      setRecordingId(id);
      recorder.startRecording();
    },
    [recorder],
  );

  const stopRecording = useCallback(() => {
    recorder.cancelRecording();
    setRecordingId(null);
  }, [recorder]);

  const groups = useMemo(
    () =>
      HOTKEY_ACTION_GROUPS.map((group) => ({
        id: group,
        label: t(`hotkeys.group.${group}`),
        actions: HOTKEY_ACTIONS.filter((a) => a.group === group),
      })).filter((g) => g.actions.length > 0),
    [t],
  );

  const overrideCount = Object.keys(overrides).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="size-4 text-muted-foreground" />
          {t("settings.hotkeysCardTitle")}
        </CardTitle>
        <CardDescription>{t("settings.hotkeysCardDesc")}</CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={overrideCount === 0}
            onClick={() => {
              stopRecording();
              resetAll();
            }}
          >
            <RotateCcw className="size-3.5" />
            {t("settings.hotkeysResetAll")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </h3>
            <ul className="divide-y rounded-lg border">
              {group.actions.map((action) => {
                const isRecording = recordingId === action.id;
                const combo = bindings[action.id];
                const partners = conflicts[action.id] ?? [];
                const isCustom =
                  overrides[action.id] !== undefined &&
                  overrides[action.id] !== HOTKEY_DEFAULTS[action.id];
                return (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {t(action.labelKey, action.labelParams ?? {})}
                      </p>
                      {partners.length > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-destructive">
                          <AlertTriangle className="size-3 shrink-0" />
                          <span className="truncate">
                            {t("settings.hotkeysConflict", {
                              actions: partners
                                .map((id) => labelOf(id))
                                .join(", "),
                            })}
                          </span>
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={isRecording ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "min-w-28 font-mono text-xs tabular-nums",
                        partners.length > 0 && !isRecording && "border-destructive/60",
                      )}
                      aria-label={t("settings.hotkeysEditAria", {
                        action: t(action.labelKey, action.labelParams ?? {}),
                      })}
                      onClick={() =>
                        isRecording ? stopRecording() : startRecording(action.id)
                      }
                    >
                      {isRecording
                        ? t("settings.hotkeysRecording")
                        : formatForDisplay(combo)}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!isCustom}
                      title={t("settings.hotkeysResetRow")}
                      aria-label={t("settings.hotkeysResetRow")}
                      onClick={() => {
                        stopRecording();
                        resetBinding(action.id);
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          {t("settings.hotkeysRecordHint")}
        </p>
      </CardContent>
    </Card>
  );
}
