import { AgentDock } from "@/components/repo/agent-dock";
import { InAppTerminalLayout } from "@/components/repo/layout/in-app-terminal-layout";

interface Props {
  path: string;
  children: React.ReactNode;
}

export function RepoTabLayout({ path, children }: Props) {
  return (
    <InAppTerminalLayout path={path}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
        <AgentDock path={path} />
      </div>
    </InAppTerminalLayout>
  );
}
