import { listProjectFields, type ProjectField, type ProjectItem } from "@/lib/github-expansion/api";
import type { HubAccount } from "@/lib/hub/types";

const MAX_PAGES = 20;

/** 28: every field definition of a project (paginated), so single-select edits use real option IDs. */
export async function loadAllProjectFields(a: HubAccount, projectId: string, list = listProjectFields): Promise<ProjectField[]> {
  const out: ProjectField[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: Awaited<ReturnType<typeof listProjectFields>> = await list(a, projectId, cursor);
    out.push(...page.items.filter((f) => f && f.id));
    if (!page.hasMore || !page.cursor) return out;
    cursor = page.cursor;
  }
  throw new Error("Project has too many fields to load.");
}

export type ProjectFieldRow = {
  fieldId: string; name: string; value: string;
  kind: "text" | "number" | "date" | "single_select" | "unsupported";
  optionId?: string; options?: { id: string; name: string }[];
};

/** Item values joined with definitions. Fields without a value are listed too so they can be set. Iteration etc. stay read-only. */
export function projectFieldRows(item: ProjectItem, fields: ProjectField[] | null): ProjectFieldRow[] {
  const values = new Map(item.fieldValues.nodes.filter((v) => v.field).map((v) => [v.field!.id, v]));
  const kindOf = (dataType: string): ProjectFieldRow["kind"] =>
    dataType === "TEXT" ? "text" : dataType === "NUMBER" ? "number" : dataType === "DATE" ? "date" : dataType === "SINGLE_SELECT" ? "single_select" : "unsupported";
  const show = (v: ProjectItem["fieldValues"]["nodes"][number] | undefined) => v ? v.name ?? v.text ?? (v.number !== undefined ? String(v.number) : v.date) ?? "" : "";
  if (!fields) {
    // Definitions unavailable: keep the previous text/number/date editing from the value shape; selects read-only.
    return [...values.values()].map((v) => ({
      fieldId: v.field!.id, name: v.field!.name, value: show(v),
      kind: v.text !== undefined ? "text" : v.number !== undefined ? "number" : v.date !== undefined ? "date" : "unsupported",
    }));
  }
  return fields
    .filter((f) => values.has(f.id) || kindOf(f.dataType) !== "unsupported")
    .map((f) => {
      const v = values.get(f.id);
      const kind = kindOf(f.dataType);
      return { fieldId: f.id, name: f.name, value: show(v), kind, optionId: v?.optionId, options: kind === "single_select" ? (f.options ?? []).map((o) => ({ id: o.id, name: o.name })) : undefined };
    });
}
