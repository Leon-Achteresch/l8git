const EVENT = "l8git-agent-composer-insert";

export function insertIntoAgentComposer(text: string): void {
  if (typeof window === "undefined" || !text) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
}

export function onAgentComposerInsert(handler: (text: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => handler(String((event as CustomEvent<string>).detail ?? ""));
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
