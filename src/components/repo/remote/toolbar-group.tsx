import { ReactNode } from "react";

interface ToolbarGroupProps {
  children: ReactNode;
}

export function ToolbarGroup({ children }: ToolbarGroupProps) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-0.5 rounded-xl bg-secondary/30 p-0.5 backdrop-blur-md transition-colors hover:bg-secondary/50">
      {children}
    </div>
  );
}
