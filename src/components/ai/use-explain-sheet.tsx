import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { isAiConfigured } from "@/lib/ai-setup";
import type { ExplainRequest } from "./explain-sheet";

const ExplainSheet = lazy(() => import("./explain-sheet").then(m => ({ default: m.ExplainSheet })));
const AiSetupDialog = lazy(() => import("@/components/onboarding/ai-setup-dialog").then(m => ({ default: m.AiSetupDialog })));

export interface ExplainSheetController {
  open: (request: ExplainRequest) => void;
  element: ReactNode;
}

export function useExplainSheet(): ExplainSheetController {
  const [request, setRequest] = useState<ExplainRequest | null>(null);
  const [pending, setPending] = useState<ExplainRequest | null>(null);
  const [mounted, setMounted] = useState(false);

  const open = useCallback((next: ExplainRequest) => {
    setMounted(true);
    if (!isAiConfigured()) {
      setPending(next);
      return;
    }
    setRequest(next);
  }, []);

  const element = mounted ? (
    <Suspense fallback={null}>
      <ExplainSheet request={request} onClose={() => setRequest(null)} />
      <AiSetupDialog
        open={!!pending}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        onReady={() => {
          setRequest(pending);
          setPending(null);
        }}
      />
    </Suspense>
  ) : null;

  return { open, element };
}
