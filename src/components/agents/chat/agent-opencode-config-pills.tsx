import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { AgentControlPill } from "@/components/agents/chat/agent-control-pill";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { openCodeChatStore } from "@/lib/agents/providers/opencode/chat-store";

const RADIO_CLASS = "rounded-[9px] py-1.5 text-[12px]";
const BOOLEAN_ON = "__on";
const BOOLEAN_OFF = "__off";

export function AgentOpenCodeConfigPills() {
  const { t } = useTranslation();
  const selections = useStore(
    openCodeChatStore,
    (state) => state.configSelections,
  );
  const setSelection = useStore(
    openCodeChatStore,
    (state) => state.setConfigSelection,
  );

  return (
    <>
      {selections.map((selection) => {
        const label =
          selection.type === "boolean"
            ? selection.value
              ? t("agentChat.settings.on")
              : t("agentChat.settings.off")
            : (selection.choices.find((choice) => choice.value === selection.value)
                ?.label ??
              String(selection.value || t("agentChat.settings.default")));
        return (
          <AgentControlPill
            key={selection.id}
            icon={<SlidersHorizontal />}
            label={label}
            title={selection.description || selection.name}
          >
            <DropdownMenuLabel className="ag-label">
              {selection.name}
            </DropdownMenuLabel>
            {selection.type === "boolean" ? (
              <DropdownMenuRadioGroup
                value={selection.value ? BOOLEAN_ON : BOOLEAN_OFF}
                onValueChange={(value) =>
                  setSelection(selection.id, value === BOOLEAN_ON)
                }
              >
                <DropdownMenuRadioItem value={BOOLEAN_ON} className={RADIO_CLASS}>
                  {t("agentChat.settings.on")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value={BOOLEAN_OFF} className={RADIO_CLASS}>
                  {t("agentChat.settings.off")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            ) : (
              <DropdownMenuRadioGroup
                value={
                  typeof selection.value === "string" ? selection.value : ""
                }
                onValueChange={(value) => setSelection(selection.id, value)}
              >
                {selection.choices.map((choice) => (
                  <DropdownMenuRadioItem
                    key={choice.value}
                    value={choice.value}
                    className={RADIO_CLASS}
                    title={choice.description || undefined}
                  >
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </AgentControlPill>
        );
      })}
    </>
  );
}
