import { useEffect, useState } from "react";

function elapsedLabel(startedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function AgentThreadWorkingTimer({ since }: { since: number }) {
  const [label, setLabel] = useState(() => elapsedLabel(since));

  useEffect(() => {
    setLabel(elapsedLabel(since));
    const timer = window.setInterval(() => {
      if (!document.hidden) setLabel(elapsedLabel(since));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [since]);

  return <>{label}</>;
}
