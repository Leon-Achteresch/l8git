import { memo } from "react";

import { AgentItemView } from "@/components/agents/chat/agent-item";
import {
  MessageBubble,
  MessageBubbleContent,
  MessageBubbleGroup,
} from "@/components/agents/ui/message-bubble";
import type { AgentTurn } from "@/lib/agents/types";

export const AgentTurnView = memo(function AgentTurnView({
  turn,
}: {
  turn: AgentTurn;
}) {
  return (
    <MessageBubbleGroup spacing="default" className="gap-3">
      {turn.items.map((item) => (
        <AgentItemView key={item.id} item={item} turn={turn} />
      ))}
      {turn.status === "failed" && turn.error ? (
        <MessageBubble align="start" variant="danger">
          <MessageBubbleContent>{turn.error}</MessageBubbleContent>
        </MessageBubble>
      ) : null}
    </MessageBubbleGroup>
  );
});
