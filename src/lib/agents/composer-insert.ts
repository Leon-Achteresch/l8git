type InsertHandler = (text: string) => void;

const handlers = new Set<InsertHandler>();

export function insertIntoAgentComposer(text: string): void {
  if (!text) return;
  for (const handler of [...handlers]) {
    try {
      handler(text);
    } catch {
      continue;
    }
  }
}

export function onAgentComposerInsert(handler: InsertHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
