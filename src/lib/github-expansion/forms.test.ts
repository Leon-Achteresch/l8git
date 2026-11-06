import { describe, expect, it } from "vitest";
import { parseIssueForm, parseWorkflowInputs, renderIssueAnswers, validateIssueAnswers, validateWorkflowInputs } from "./forms";

const form = `name: Bug report
description: Report a bug
labels: [bug]
body:
  - type: markdown
    attributes:
      value: Please provide details
  - type: textarea
    id: steps
    attributes:
      label: Steps
      render: bash
    validations:
      required: true
  - type: dropdown
    id: platform
    attributes:
      label: Platform
      options: [Linux, Windows]
    validations:
      required: true
  - type: checkboxes
    id: checks
    attributes:
      label: Confirmation
      options:
        - label: I searched existing issues
          required: true
`;
describe("GitHub repository forms", () => {
  it("validates required fields and checkbox-specific requirements", () => {
    const schema = parseIssueForm(form);
    expect(schema.labels).toEqual(["bug"]);
    expect(Object.keys(validateIssueAnswers(schema, {}))).toEqual(["steps", "platform", "checks"]);
    expect(validateIssueAnswers(schema, { steps: "repro", platform: "Mac", checks: [true] })).toEqual({ platform: "Invalid selected option." });
    expect(validateIssueAnswers(schema, { steps: "repro", platform: "Linux", checks: [true] })).toEqual({});
  });
  it("renders answers without letting embedded backticks break fenced fields", () => {
    const body = renderIssueAnswers(parseIssueForm(form), { steps: "echo ```", platform: "Linux", checks: [true] });
    expect(body).toContain("````bash\necho ```\n````");
    expect(body).toContain("- [x] I searched existing issues");
    expect(body).not.toContain("Please provide details");
  });
  it("rejects duplicate IDs, unknown field types, duplicate YAML keys and huge input", () => {
    expect(() => parseIssueForm(form.replace("id: platform", "id: steps"))).toThrow("unique");
    expect(() => parseIssueForm(form.replace("type: textarea", "type: execute"))).toThrow("Unsupported");
    expect(() => parseIssueForm("name: a\nname: b\nbody: []")).toThrow();
    expect(() => parseIssueForm("a".repeat(256001))).toThrow("limit");
  });
});
describe("manual workflow input schema", () => {
  it("recognizes YAML on as a key and retains boolean/number defaults", () => {
    const inputs = parseWorkflowInputs(`on:
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: false
        required: true
      target:
        type: choice
        options: [staging, production]
        required: true
      count:
        type: number
        default: 2
`);
    expect(inputs[0]).toMatchObject({ name: "dry_run", type: "boolean", default: false });
    expect(validateWorkflowInputs(inputs, { target: "staging" })).toEqual({});
    expect(validateWorkflowInputs(inputs, { target: "unknown", count: Infinity, dry_run: "false" })).toEqual({ dry_run: "Expected true or false.", target: "Choose a listed option.", count: "Expected a finite number." });
  });
  it("rejects nondispatch workflows and supports empty dispatch declarations", () => {
    expect(() => parseWorkflowInputs("on: push")).toThrow("manual dispatch");
    expect(parseWorkflowInputs("on: workflow_dispatch")).toEqual([]);
    expect(parseWorkflowInputs("on:\n  workflow_dispatch:")).toEqual([]);
  });
});
