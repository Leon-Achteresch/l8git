import type { ChangeMapNode } from "@/lib/change-workflow/model";

export type Rect = { x: number; y: number; w: number; h: number };

/** Weighted binary-split treemap in unit space; order is the stable input order, so tiles don't jump across filters. */
export function layoutTiles<T>(items: readonly { item: T; weight: number }[], rect: Rect = { x: 0, y: 0, w: 1, h: 1 }): { item: T; rect: Rect }[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ item: items[0].item, rect }];
  const total = items.reduce((s, i) => s + i.weight, 0);
  let cut = 1;
  let acc = items[0].weight;
  while (cut < items.length - 1 && acc < total / 2) acc += items[cut++].weight;
  const share = total > 0 ? acc / total : cut / items.length;
  const [a, b]: [Rect, Rect] = rect.w >= rect.h
    ? [{ ...rect, w: rect.w * share }, { ...rect, x: rect.x + rect.w * share, w: rect.w * (1 - share) }]
    : [{ ...rect, h: rect.h * share }, { ...rect, y: rect.y + rect.h * share, h: rect.h * (1 - share) }];
  return [...layoutTiles(items.slice(0, cut), a), ...layoutTiles(items.slice(cut), b)];
}

export type MapIndex = {
  byId: Map<string, ChangeMapNode>;
  children: Map<string | null, ChangeMapNode[]>;
  /** File count below each node (1 for a file). */
  leaves: Map<string, number>;
};

export function indexMap(nodes: readonly ChangeMapNode[]): MapIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, ChangeMapNode[]>();
  for (const n of nodes) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "directory" ? -1 : 1));
  const leaves = new Map<string, number>();
  const count = (n: ChangeMapNode): number => {
    const cached = leaves.get(n.id);
    if (cached !== undefined) return cached;
    const v = n.kind === "file" ? 1 : (children.get(n.id) ?? []).reduce((s, c) => s + count(c), 0);
    leaves.set(n.id, v);
    return v;
  };
  nodes.forEach(count);
  return { byId, children, leaves };
}

export const nodeName = (id: string) => id.slice(id.lastIndexOf("/") + 1);
