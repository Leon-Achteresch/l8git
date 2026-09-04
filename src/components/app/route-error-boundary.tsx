// Catches render errors of the active route.
//
// Without a boundary, React 19 unmounts the whole root on a render-phase
// error: the app goes blank and the message only lands in DevTools. Here the
// chrome (header, navigation) stays mounted and the message plus component
// stack are copyable — exactly what a bug report needs.

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    console.error("[l8git] Render error", error, info.componentStack);
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
      <Card
        role="alert"
        aria-live="assertive"
        className="w-full max-w-2xl shadow-lg"
      >
        <CardHeader>
          <div className="flex items-center gap-2 text-destructive">
            <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
            </span>
            <CardTitle className="text-sm">{t("crash.title")}</CardTitle>
          </div>
          <CardDescription>{t("crash.body")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs break-words">
            {error.message || error.name}
          </p>
          {details ? (
            <pre className="max-h-64 overflow-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
              {details}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" autoFocus onClick={onRetry}>
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
        </CardContent>
      </Card>
    </div>
  );
}
