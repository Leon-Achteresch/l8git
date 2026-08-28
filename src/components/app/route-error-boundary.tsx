// Faengt Render-Fehler der aktiven Route ab.
//
// Ohne Fehlergrenze nimmt React 19 bei einem Fehler in der Render-Phase den
// kompletten Root vom Bildschirm: Die App ist leer, und die Meldung steht nur
// in der DevTools-Konsole. Hier bleibt der Rahmen (Header, Navigation) stehen
// und die Meldung samt Komponentenstack ist kopierbar — genau das, was ein
// Bugreport braucht.

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /** Wechselt der Key (z. B. der Pfad), wird ein gemerkter Fehler verworfen. */
  resetKey?: string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

const EMPTY_STATE: RouteErrorBoundaryState = { error: null, componentStack: "" };

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = EMPTY_STATE;

  static getDerivedStateFromError(error: unknown): Partial<RouteErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("[l8git] Render-Fehler", error, info.componentStack);
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState(EMPTY_STATE);
    }
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <RouteCrashFallback
        error={error}
        componentStack={componentStack}
        onRetry={() => this.setState(EMPTY_STATE)}
      />
    );
  }
}

function RouteCrashFallback({
  error,
  componentStack,
  onRetry,
}: {
  error: Error;
  componentStack: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const details = [error.stack ?? `${error.name}: ${error.message}`, componentStack]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <h2 className="text-sm font-medium">{t("crash.title")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("crash.body")}</p>
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-words">
          {error.message || error.name}
        </p>
        {details ? (
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
            {details}
          </pre>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" onClick={onRetry}>
            {t("crash.retry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${error.message}\n\n${details}`)
                .then(() => toast.success(t("crash.copied")))
                .catch(() => toast.error(t("crash.copyFailed")));
            }}
          >
            {t("crash.copy")}
          </Button>
        </div>
      </div>
    </div>
  );
}
