import { useEffect, useState, type ComponentType, type ReactNode } from "react";

/** A panel can appear as soon as its code is ready, without Suspense's fallback
 * reveal delay. Create at module scope; preload alongside native data reads. */
export function loadablePanel<P extends object>(load: () => Promise<ComponentType<P>>, fallback: ReactNode) {
  let Component: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () => pending ??= load().then(loaded => (Component = loaded)).catch(error => {
    pending = undefined;
    throw error;
  });

  function LoadablePanel(props: P) {
    const [state, setState] = useState<{ Component?: ComponentType<P>; error?: unknown }>(() => ({ Component }));
    useEffect(() => {
      let alive = true;
      void preload().then(
        Component => { if (alive) setState({ Component }); },
        error => { if (alive) setState({ error }); },
      );
      return () => { alive = false; };
    }, []);
    if (state.error) throw state.error;
    return state.Component ? <state.Component {...props} /> : fallback;
  }
  return { Component: LoadablePanel, preload };
}
