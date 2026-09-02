import { useEffect, useState } from "react";
import App from "./App";
import "@/components/agents/agents.css";
import { initAppearance } from "./lib/appearance";
import { initSounds } from "./lib/sounds";
import { loadBootWorkspace, type BootWorkspace } from "./lib/appLifecycle";

let booted = false;

export function MonocodeApp() {
  const [boot, setBoot] = useState<BootWorkspace | null>(null);
  useEffect(() => {
    if (!booted) {
      booted = true;
      initAppearance();
      initSounds();
    }
    void loadBootWorkspace()
      .catch(() => ({ windowTransfer: null, resumed: null, history: [], historyCwd: null }))
      .then(setBoot);
  }, []);
  if (!boot) return <div className="monocode-root" />;
  return (
    <div className="monocode-root">
      <App
        windowTransfer={boot.windowTransfer}
        resumed={boot.resumed}
        installedUpdate={null}
        history={boot.history}
        historyCwd={boot.historyCwd}
      />
    </div>
  );
}
