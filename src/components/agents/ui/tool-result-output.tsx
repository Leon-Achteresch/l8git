import {
  AgentCode,
  type AgentCodeLanguage,
} from "@/components/agents/ui/agent-code";
import { cn } from "@/lib/utils";

export interface ToolResultOutputProps {
  children: string;
  language?: AgentCodeLanguage;
  highlight?: boolean;
  className?: string;
}

export function ToolResultOutput({
  children,
  language = "bash",
  highlight = true,
  className,
}: ToolResultOutputProps) {
  return (
    <AgentCode
      code={children}
      language={language}
      highlight={highlight}
      className={cn(
        "whitespace-pre-wrap break-words text-foreground/80",
        className,
      )}
    />
  );
}
