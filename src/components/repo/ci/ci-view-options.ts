import { useState } from "react";

export type CiViewOptions = {
  query: string;
  status: string;
  branch: string;
  workflow: string;
  sort: string;
  compact: boolean;
  metadata: boolean;
};
export const defaultCiView: CiViewOptions = {
  query: "",
  status: "all",
  branch: "",
  workflow: "",
  sort: "newest",
  compact: false,
  metadata: true,
};

export function useCiViewOptions(path: string) {
  const storageKey = `l8git.ci-view.v1:${path}`;
  const [view, setView] = useState<CiViewOptions>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      return Object.fromEntries(
        Object.entries(defaultCiView).map(([key, value]) => [
          key,
          typeof saved?.[key] === typeof value ? saved[key] : value,
        ]),
      ) as CiViewOptions;
    } catch {
      return defaultCiView;
    }
  });
  function update(next: Partial<CiViewOptions>) {
    setView((current) => {
      const result = { ...current, ...next };
      try {
        localStorage.setItem(storageKey, JSON.stringify(result));
      } catch {
        /* Storage may be unavailable. */
      }
      return result;
    });
  }
  return { view, update };
}
