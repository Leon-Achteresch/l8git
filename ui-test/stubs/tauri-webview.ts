export function getCurrentWebview() {
  return {
    onDragDropEvent: async () => () => undefined,
    label: "main",
    listen: async () => () => undefined,
  };
}
