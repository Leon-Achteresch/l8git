export type ElicitationMode = "form" | "url";

export interface ElicitationSchemaProperty {
  type?: string;
  enum?: unknown[];
}

export interface ElicitationSchema {
  properties?: Record<string, ElicitationSchemaProperty>;
  required?: string[];
}

export interface FormElicitationRequest {
  mode: "form";
  requestId: string;
  schema: ElicitationSchema;
}

export interface UrlElicitationRequest {
  mode: "url";
  requestId: string;
  url: string;
}

export type ElicitationRequest = FormElicitationRequest | UrlElicitationRequest;

export type ElicitationAction = "accept" | "decline" | "cancel";

export interface ElicitationResponse {
  action: ElicitationAction;
  content?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function parseElicitationRequest(control_request: unknown): ElicitationRequest | null {
  if (!isRecord(control_request)) return null;
  const requestId = typeof control_request.request_id === "string" ? control_request.request_id : null;
  if (!requestId) return null;
  const params = isRecord(control_request.params) ? control_request.params : control_request;

  if (typeof params.url === "string" && params.url.trim() && isValidUrl(params.url)) {
    return { mode: "url", requestId, url: params.url };
  }

  if (isRecord(params.schema)) {
    const properties = isRecord(params.schema.properties)
      ? (params.schema.properties as Record<string, ElicitationSchemaProperty>)
      : undefined;
    const required = Array.isArray(params.schema.required)
      ? params.schema.required.filter((entry): entry is string => typeof entry === "string")
      : undefined;
    return {
      mode: "form",
      requestId,
      schema: { properties, required },
    };
  }

  return null;
}

export function validateElicitationContent(
  schema: ElicitationSchema,
  content: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const key of schema.required ?? []) {
    const value = content[key];
    if (value === undefined || value === null || value === "") errors.push(key);
  }
  const properties = schema.properties ?? {};
  for (const [key, value] of Object.entries(content)) {
    const prop = properties[key];
    if (!prop) continue;
    if (prop.enum && !prop.enum.includes(value)) {
      if (!errors.includes(key)) errors.push(key);
      continue;
    }
    const typeMismatch =
      (prop.type === "number" && typeof value !== "number") ||
      (prop.type === "string" && typeof value !== "string") ||
      (prop.type === "boolean" && typeof value !== "boolean");
    if (typeMismatch && !errors.includes(key)) errors.push(key);
  }
  return errors;
}

export function buildElicitationResponse(
  action: ElicitationAction,
  content?: Record<string, unknown>,
): ElicitationResponse {
  if (action === "accept" && content) return { action, content };
  return { action };
}
