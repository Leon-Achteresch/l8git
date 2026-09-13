import { createFileRoute, redirect } from "@tanstack/react-router";

import { useUiStore } from "@/lib/ui-store";

export const Route = createFileRoute("/inbox")({
  beforeLoad: () => {
    useUiStore.getState().openInbox();
    throw redirect({ to: "/" });
  },
  component: function InboxRedirect() {
    return null;
  },
});
