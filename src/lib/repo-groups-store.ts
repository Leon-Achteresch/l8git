import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RepoNode = { type: "repo"; path: string };

export type GroupNode = {
  type: "group";
  id: string;
  name: string;
  hue: number;
  collapsed: boolean;
  children: ForestNode[];
};

export type ForestNode = RepoNode | GroupNode;

export function nodeKey(node: ForestNode): string {
  return node.type === "repo" ? node.path : `group:${node.id}`;
}

export function isGroupKey(key: string): boolean {
  return key.startsWith("group:");
}

const GROUP_HUES = [262, 199, 152, 22, 340, 45, 217, 288, 12, 174];

function collectGroupHues(nodes: ForestNode[], acc: number[] = []): number[] {
  for (const n of nodes) {
    if (n.type === "group") {
      acc.push(n.hue);
      collectGroupHues(n.children, acc);
    }
  }
  return acc;
}

function pickHue(forest: ForestNode[]): number {
  const used = collectGroupHues(forest);
  const free = GROUP_HUES.find((h) => !used.includes(h));
  return free ?? GROUP_HUES[used.length % GROUP_HUES.length];
}

function findNode(nodes: ForestNode[], key: string): ForestNode | null {
  for (const n of nodes) {
    if (nodeKey(n) === key) return n;
    if (n.type === "group") {
      const r = findNode(n.children, key);
      if (r) return r;
    }
  }
  return null;
}

function isWithin(group: GroupNode, key: string): boolean {
  return findNode(group.children, key) != null;
}

function removeNode(
  nodes: ForestNode[],
  key: string,
): [ForestNode[], ForestNode | null] {
  let removed: ForestNode | null = null;
  const next: ForestNode[] = [];
  for (const n of nodes) {
    if (nodeKey(n) === key) {
      removed = n;
      continue;
    }
    if (n.type === "group") {
      const [childNext, childRemoved] = removeNode(n.children, key);
      if (childRemoved) removed = childRemoved;
      next.push({ ...n, children: childNext });
    } else {
      next.push(n);
    }
  }
  return [next, removed];
}

function insertNode(
  nodes: ForestNode[],
  containerId: string | null,
  index: number,
  node: ForestNode,
): ForestNode[] {
  if (containerId === null) {
    const next = nodes.slice();
    const i = index < 0 || index > next.length ? next.length : index;
    next.splice(i, 0, node);
    return next;
  }
  return nodes.map((n) => {
    if (n.type !== "group") return n;
    if (n.id === containerId) {
      const children = n.children.slice();
      const i =
        index < 0 || index > children.length ? children.length : index;
      children.splice(i, 0, node);
      return { ...n, children };
    }
    return { ...n, children: insertNode(n.children, containerId, index, node) };
  });
}

function findContainerInfo(
  nodes: ForestNode[],
  key: string,
  containerId: string | null = null,
): { containerId: string | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (nodeKey(n) === key) return { containerId, index: i };
    if (n.type === "group") {
      const r = findContainerInfo(n.children, key, n.id);
      if (r) return r;
    }
  }
  return null;
}

function updateGroup(
  nodes: ForestNode[],
  id: string,
  patch: (g: GroupNode) => GroupNode,
): ForestNode[] {
  return nodes.map((n) => {
    if (n.type !== "group") return n;
    if (n.id === id) return patch(n);
    return { ...n, children: updateGroup(n.children, id, patch) };
  });
}

function dissolveGroup(nodes: ForestNode[], id: string): ForestNode[] {
  const out: ForestNode[] = [];
  for (const n of nodes) {
    if (n.type === "group") {
      if (n.id === id) {
        out.push(...n.children);
      } else {
        out.push({ ...n, children: dissolveGroup(n.children, id) });
      }
    } else {
      out.push(n);
    }
  }
  return out;
}

function pruneRepos(nodes: ForestNode[], allowed: Set<string>): ForestNode[] {
  const out: ForestNode[] = [];
  for (const n of nodes) {
    if (n.type === "repo") {
      if (allowed.has(n.path)) out.push(n);
    } else {
      out.push({ ...n, children: pruneRepos(n.children, allowed) });
    }
  }
  return out;
}

function collectRepoPaths(nodes: ForestNode[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.type === "repo") acc.add(n.path);
    else collectRepoPaths(n.children, acc);
  }
  return acc;
}

export function countRepos(group: GroupNode): number {
  let c = 0;
  for (const ch of group.children) {
    c += ch.type === "repo" ? 1 : countRepos(ch);
  }
  return c;
}

export function groupRepoPaths(group: GroupNode): string[] {
  return [...collectRepoPaths(group.children, new Set<string>())];
}

export function groupContainsPath(group: GroupNode, path: string): boolean {
  return findNode(group.children, path) != null;
}

export function filterForest(
  nodes: ForestNode[],
  allowed: Set<string>,
): ForestNode[] {
  const out: ForestNode[] = [];
  for (const n of nodes) {
    if (n.type === "repo") {
      if (allowed.has(n.path)) out.push(n);
    } else {
      const children = filterForest(n.children, allowed);
      if (n.children.length === 0 || children.length > 0) {
        out.push({ ...n, children });
      }
    }
  }
  return out;
}

export function flattenVisibleKeys(nodes: ForestNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(nodeKey(n));
    if (n.type === "group" && !n.collapsed) {
      out.push(...flattenVisibleKeys(n.children));
    }
  }
  return out;
}

export function flattenRepoPaths(nodes: ForestNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "repo") out.push(n.path);
    else out.push(...flattenRepoPaths(n.children));
  }
  return out;
}

function applyActiveCollapse(
  nodes: ForestNode[],
  activePath: string | null,
): ForestNode[] {
  return nodes.map((n) => {
    if (n.type === "repo") return n;
    const hasActive = activePath != null && groupContainsPath(n, activePath);
    const children = applyActiveCollapse(n.children, activePath);
    const collapsed = !hasActive;
    if (n.collapsed === collapsed && children === n.children) return n;
    return { ...n, collapsed, children };
  });
}

export type GroupListEntry = { id: string; name: string; depth: number; hue: number };

export function listGroups(
  nodes: ForestNode[],
  depth = 0,
  acc: GroupListEntry[] = [],
): GroupListEntry[] {
  for (const n of nodes) {
    if (n.type === "group") {
      acc.push({ id: n.id, name: n.name, depth, hue: n.hue });
      listGroups(n.children, depth + 1, acc);
    }
  }
  return acc;
}

export function groupIdOfPath(
  nodes: ForestNode[],
  path: string,
): string | null {
  const info = findContainerInfo(nodes, path);
  return info?.containerId ?? null;
}

type RepoGroupsState = {
  forest: ForestNode[];
  reconcile: (paths: string[]) => void;
  createGroup: (
    name: string,
    memberPaths: string[],
    parentId?: string | null,
  ) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setCollapsed: (id: string, collapsed: boolean) => void;
  syncCollapseToActive: (activePath: string | null) => void;
  addToGroup: (path: string, groupId: string) => void;
  removeFromGroup: (path: string) => void;
  createSubgroup: (parentId: string, name: string) => string;
  moveNodeRelativeTo: (activeKey: string, overKey: string) => void;
};

export const useRepoGroupsStore = create<RepoGroupsState>()(
  persist(
    (set) => ({
      forest: [],

      reconcile(paths) {
        set((s) => {
          const allowed = new Set(paths);
          const current = collectRepoPaths(s.forest, new Set<string>());
          const sameMembers =
            current.size === allowed.size &&
            paths.every((p) => current.has(p));
          if (sameMembers) return s;
          let forest = pruneRepos(s.forest, allowed);
          const present = collectRepoPaths(forest, new Set<string>());
          const missing = paths.filter((p) => !present.has(p));
          if (missing.length > 0) {
            forest = [
              ...forest,
              ...missing.map((path) => ({ type: "repo", path }) as RepoNode),
            ];
          }
          return { forest };
        });
      },

      createGroup(name, memberPaths, parentId = null) {
        const id = crypto.randomUUID();
        set((s) => {
          let forest = s.forest;
          let target: { containerId: string | null; index: number } = {
            containerId: parentId,
            index: Number.MAX_SAFE_INTEGER,
          };
          if (parentId === null && memberPaths.length > 0) {
            const info = findContainerInfo(forest, memberPaths[0]);
            if (info) target = info;
          }
          const members: ForestNode[] = [];
          for (const p of memberPaths) {
            const [next, removed] = removeNode(forest, p);
            forest = next;
            if (removed) members.push(removed);
          }
          const group: GroupNode = {
            type: "group",
            id,
            name,
            hue: pickHue(forest),
            collapsed: true,
            children: members,
          };
          forest = insertNode(forest, target.containerId, target.index, group);
          return { forest };
        });
        return id;
      },

      createSubgroup(parentId, name) {
        const id = crypto.randomUUID();
        set((s) => {
          const group: GroupNode = {
            type: "group",
            id,
            name,
            hue: pickHue(s.forest),
            collapsed: false,
            children: [],
          };
          return {
            forest: updateGroup(s.forest, parentId, (g) => ({
              ...g,
              collapsed: false,
              children: [...g.children, group],
            })),
          };
        });
        return id;
      },

      renameGroup(id, name) {
        set((s) => ({
          forest: updateGroup(s.forest, id, (g) => ({ ...g, name })),
        }));
      },

      deleteGroup(id) {
        set((s) => ({ forest: dissolveGroup(s.forest, id) }));
      },

      toggleCollapse(id) {
        set((s) => ({
          forest: updateGroup(s.forest, id, (g) => ({
            ...g,
            collapsed: !g.collapsed,
          })),
        }));
      },

      setCollapsed(id, collapsed) {
        set((s) => ({
          forest: updateGroup(s.forest, id, (g) => ({ ...g, collapsed })),
        }));
      },

      syncCollapseToActive(activePath) {
        set((s) => {
          const forest = applyActiveCollapse(s.forest, activePath);
          return forest === s.forest ? s : { forest };
        });
      },

      addToGroup(path, groupId) {
        set((s) => {
          const [without, removed] = removeNode(s.forest, path);
          if (!removed) return s;
          return {
            forest: updateGroup(without, groupId, (g) => ({
              ...g,
              collapsed: false,
              children: [...g.children, removed],
            })),
          };
        });
      },

      removeFromGroup(path) {
        set((s) => {
          const groupId = groupIdOfPath(s.forest, path);
          if (groupId === null) return s;
          const groupInfo = findContainerInfo(s.forest, `group:${groupId}`);
          const [without, removed] = removeNode(s.forest, path);
          if (!removed) return s;
          const containerId = groupInfo?.containerId ?? null;
          const index =
            groupInfo != null ? groupInfo.index + 1 : Number.MAX_SAFE_INTEGER;
          return { forest: insertNode(without, containerId, index, removed) };
        });
      },

      moveNodeRelativeTo(activeKey, overKey) {
        set((s) => {
          if (activeKey === overKey) return s;
          const activeNode = findNode(s.forest, activeKey);
          if (!activeNode) return s;
          if (activeNode.type === "group" && isWithin(activeNode, overKey)) {
            return s;
          }
          const [without, removed] = removeNode(s.forest, activeKey);
          if (!removed) return s;
          const info = findContainerInfo(without, overKey);
          if (!info) return s;
          return {
            forest: insertNode(without, info.containerId, info.index, removed),
          };
        });
      },
    }),
    {
      name: "l8git-repo-groups",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ forest: state.forest }),
    },
  ),
);
