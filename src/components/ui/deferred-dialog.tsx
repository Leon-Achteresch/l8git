import { lazy, Suspense, type ComponentType } from "react";
import { useEverTrue } from "@/lib/use-ever-true";

/** Keep a closed dialog's code off the startup path, retaining its state after first use. */
export function deferredDialog<P extends { open: boolean }>(load: () => Promise<ComponentType<P>>) {
  const Dialog = lazy(() => load().then(component => ({ default: component })));
  return function DeferredDialog(props: P) {
    const used = useEverTrue(props.open);
    return used ? <Suspense fallback={null}><Dialog {...props} /></Suspense> : null;
  };
}
