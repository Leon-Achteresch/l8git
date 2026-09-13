import { describe, expect, it } from "vitest";

import {
  buildElicitationResponse,
  parseElicitationRequest,
  validateElicitationContent,
} from "@/lib/agents/elicitation";

describe("ASK-06 elicitation", () => {
  it("parses a form control_request", () => {
    const parsed = parseElicitationRequest({
      request_id: "req-1",
      params: {
        schema: {
          properties: { name: { type: "string" }, role: { type: "string", enum: ["admin", "user"] } },
          required: ["name"],
        },
      },
    });
    expect(parsed).toEqual({
      mode: "form",
      requestId: "req-1",
      schema: {
        properties: { name: { type: "string" }, role: { type: "string", enum: ["admin", "user"] } },
        required: ["name"],
      },
    });
  });

  it("parses a url control_request", () => {
    const parsed = parseElicitationRequest({
      request_id: "req-2",
      params: { url: "https://example.com/verify" },
    });
    expect(parsed).toEqual({ mode: "url", requestId: "req-2", url: "https://example.com/verify" });
  });

  it("rejects an invalid url", () => {
    const parsed = parseElicitationRequest({ request_id: "req-3", params: { url: "not-a-url" } });
    expect(parsed).toBeNull();
  });

  it("returns null for an unsupported schema", () => {
    expect(parseElicitationRequest({ request_id: "req-4", params: {} })).toBeNull();
    expect(parseElicitationRequest(null)).toBeNull();
    expect(parseElicitationRequest({ params: {} })).toBeNull();
  });

  it("validates required fields and enum/select values", () => {
    const schema = {
      properties: { role: { type: "string", enum: ["admin", "user"] } },
      required: ["name", "role"],
    };
    const errors = validateElicitationContent(schema, { role: "owner" });
    expect(errors).toContain("name");
    expect(errors).toContain("role");
    expect(validateElicitationContent(schema, { name: "x", role: "admin" })).toEqual([]);
  });

  it("builds accept/decline/cancel responses", () => {
    expect(buildElicitationResponse("accept", { name: "x" })).toEqual({
      action: "accept",
      content: { name: "x" },
    });
    expect(buildElicitationResponse("decline")).toEqual({ action: "decline" });
    expect(buildElicitationResponse("cancel")).toEqual({ action: "cancel" });
  });
});
