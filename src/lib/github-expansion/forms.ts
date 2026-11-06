import { parse } from "yaml";

export type IssueFormField = {
  id: string; type: "markdown" | "input" | "textarea" | "dropdown" | "checkboxes";
  label: string; description: string; placeholder: string; value: string; required: boolean;
  options: { label: string; required: boolean }[]; multiple: boolean; render: string | null;
};
export type IssueForm = { name: string; description: string; title: string; labels: string[]; assignees: string[]; fields: IssueFormField[] };
export type FormAnswers = Record<string, string | string[] | boolean[]>;
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a YAML mapping.");
  return value as Obj;
}
function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function texts(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(value) || value.some(v => typeof v !== "string")) throw new Error("Expected text list.");
  return value as string[];
}
export function parseRepositoryYaml(raw: string): unknown {
  if (raw.length > 256_000) throw new Error("Repository YAML exceeds the 256 KB limit.");
  return parse(raw, { maxAliasCount: 20, uniqueKeys: true });
}
export function parseIssueForm(raw: string): IssueForm {
  const root = object(parseRepositoryYaml(raw));
  if (!Array.isArray(root.body) || !root.body.length || root.body.length > 100) throw new Error("Issue form must contain between 1 and 100 fields.");
  const seen = new Set<string>();
  const fields = root.body.map((value, index): IssueFormField => {
    const field = object(value), attrs = object(field.attributes ?? {}), validation = object(field.validations ?? {});
    const type = text(field.type);
    if (!["markdown", "input", "textarea", "dropdown", "checkboxes"].includes(type)) throw new Error(`Unsupported issue form field: ${type}`);
    const id = text(field.id, `field-${index}`);
    if (!id || seen.has(id)) throw new Error("Issue form field IDs must be unique.");
    seen.add(id);
    const label = text(attrs.label);
    if (type !== "markdown" && !label.trim()) throw new Error("Issue field label is missing.");
    const options = type === "checkboxes"
      ? (Array.isArray(attrs.options) ? attrs.options : []).map(option => { const o = object(option); return { label: text(o.label), required: o.required === true }; })
      : texts(attrs.options).map(label => ({ label, required: false }));
    if ((type === "dropdown" || type === "checkboxes") && (!options.length || options.some(o => !o.label))) throw new Error("Issue field options are missing.");
    return { id, type: type as IssueFormField["type"], label, description: text(attrs.description), placeholder: text(attrs.placeholder), value: text(attrs.value), required: validation.required === true, options, multiple: attrs.multiple === true, render: typeof attrs.render === "string" ? attrs.render : null };
  });
  const name = text(root.name);
  if (!name.trim()) throw new Error("Issue form name is missing.");
  return { name, description: text(root.description), title: text(root.title), labels: texts(root.labels), assignees: texts(root.assignees), fields };
}

export function validateIssueAnswers(form: IssueForm, answers: FormAnswers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.type === "markdown") continue;
    const answer = answers[field.id];
    if (field.type === "checkboxes") {
      const checked = Array.isArray(answer) && answer.every(v => typeof v === "boolean") ? answer as boolean[] : [];
      if (field.options.some((option, index) => option.required && checked[index] !== true)
        || field.required && !checked.some(Boolean)) errors[field.id] = "Required checkboxes must be selected.";
    } else if (field.type === "dropdown") {
      const selected = typeof answer === "string" ? (answer ? [answer] : []) : Array.isArray(answer) && answer.every(v => typeof v === "string") ? answer as string[] : [];
      if (field.required && !selected.length) errors[field.id] = "Choose an option.";
      else if (selected.some(value => !field.options.some(option => option.label === value)) || !field.multiple && selected.length > 1) errors[field.id] = "Invalid selected option.";
    } else if (field.required && (typeof answer !== "string" || !answer.trim())) errors[field.id] = "This field is required.";
  }
  return errors;
}

export function renderIssueAnswers(form: IssueForm, answers: FormAnswers): string {
  const errors = validateIssueAnswers(form, answers);
  if (Object.keys(errors).length) throw new Error("Issue form has invalid or missing answers.");
  return form.fields.filter(field => field.type !== "markdown").map(field => {
    const answer = answers[field.id];
    let body: string;
    if (field.type === "checkboxes") body = field.options.map((option, index) => `- [${Array.isArray(answer) && answer[index] === true ? "x" : " "}] ${option.label}`).join("\n");
    else body = typeof answer === "string" ? answer : Array.isArray(answer) ? answer.join(", ") : "";
    if (field.render && body) {
      const fences = body.match(/`+/g) ?? [];
      const fence = "`".repeat(Math.max(3, ...fences.map(f => f.length + 1)));
      body = `${fence}${field.render.replace(/[\r\n`]/g, "")}\n${body}\n${fence}`;
    }
    return `### ${field.label}\n\n${body || "_No response_"}`;
  }).join("\n\n");
}

export type WorkflowInput = { name: string; description: string; required: boolean; type: "string" | "boolean" | "number" | "choice" | "environment"; default?: string | boolean | number; options: string[] };
export function parseWorkflowInputs(raw: string): WorkflowInput[] {
  const root = object(parseRepositoryYaml(raw));
  const on = root.on;
  if (typeof on === "string") { if (on !== "workflow_dispatch") throw new Error("Workflow does not support manual dispatch."); return []; }
  if (Array.isArray(on)) { if (!on.includes("workflow_dispatch")) throw new Error("Workflow does not support manual dispatch."); return []; }
  const triggers = object(on);
  if (!("workflow_dispatch" in triggers)) throw new Error("Workflow does not support manual dispatch.");
  const dispatch = triggers.workflow_dispatch === null ? {} : object(triggers.workflow_dispatch);
  const inputs = object(dispatch.inputs ?? {});
  return Object.entries(inputs).map(([name, value]) => {
    const input = object(value), type = text(input.type, "string");
    if (!["string", "boolean", "number", "choice", "environment"].includes(type)) throw new Error(`Unsupported workflow input type: ${type}`);
    const initial = input.default;
    return { name, type: type as WorkflowInput["type"], description: text(input.description), required: input.required === true, options: texts(input.options), ...(typeof initial === "string" || typeof initial === "number" || typeof initial === "boolean" ? { default: initial } : {}) };
  });
}
export function validateWorkflowInputs(schema: WorkflowInput[], values: Record<string, string | boolean | number>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const input of schema) {
    const value = values[input.name] ?? input.default;
    if (value === undefined || value === "") { if (input.required) errors[input.name] = "This input is required."; continue; }
    if (input.type === "boolean" && typeof value !== "boolean") errors[input.name] = "Expected true or false.";
    if (input.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) errors[input.name] = "Expected a finite number.";
    if (input.type === "choice" && !input.options.includes(String(value))) errors[input.name] = "Choose a listed option.";
    if ((input.type === "string" || input.type === "environment") && typeof value !== "string") errors[input.name] = "Expected text.";
  }
  return errors;
}
