import { Fragment, useMemo } from "react";
import { AgentCodeLine, useAgentCodeTokens } from "@/components/agents/ui/agent-code";

export function HighlightedFence({
  language,
  code,
  preProps,
}: {
  language: string;
  code: string;
  preProps: Record<string, unknown>;
}) {
  const tokens = useAgentCodeTokens(code, language);
  const lines = useMemo(() => code.split("\n"), [code]);
  return (
    <pre {...preProps}>
      <code className={`language-${language}`}>
        {lines.map((line, index) => (
          <Fragment key={index}>
            <AgentCodeLine code={line} tokens={tokens?.[index]} />
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
