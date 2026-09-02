export async function getCurrentWebview() {
  return {
    label: "main",
    listen: async () => () => undefined,
  };
}
