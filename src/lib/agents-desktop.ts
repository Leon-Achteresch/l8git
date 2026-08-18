import { UserAttentionType, getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";

import { armTurnAttention, setTurnAttentionSink } from "@/lib/agents/turn-attention";
import { setKnownRepoPathsSource } from "@/lib/agents/known-repo-paths";
import { useRepoStore } from "@/lib/repo-store";

setKnownRepoPathsSource({
  subscribe: (listener) => useRepoStore.subscribe(listener),
  get: () => useRepoStore.getState().paths,
});

setTurnAttentionSink({
  isFocused: () => typeof document !== "undefined" && document.hasFocus(),
  requestAttention: () => {
    void getCurrentWindow()
      .requestUserAttention(UserAttentionType.Informational)
      .catch(() => {});
  },
  notify: ({ title, action }) => {
    toast.info(title, {
      action: action ? { label: action.label, onClick: action.run } : undefined,
    });
  },
});

export function armDesktopTurnAttention(): () => void {
  return armTurnAttention();
}
