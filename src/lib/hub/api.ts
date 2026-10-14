import { invoke } from "@tauri-apps/api/core";

import type { HubAccount } from "./types";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Authed request to the account's API base; the token never reaches the renderer. */
export async function hubApi<T = unknown>(
  a: HubAccount,
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await invoke<{ status: number; data: T }>("hub_api", {
    host: a.host,
    login: a.login,
    method,
    path,
    body: body ?? null,
  });
  return res.data;
}

export async function gql<T>(a: HubAccount, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await hubApi<{ data: T }>(a, "POST", "/graphql", { query, variables });
  return res.data;
}

export const enc = encodeURIComponent;

export function webBase(a: HubAccount): string {
  return `https://${a.host}`;
}
