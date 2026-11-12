import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({ default: { t: (k: string) => k } }));

import { issueErrorMessage } from "./issue-errors";

describe("issueErrorMessage", () => {
  it("recognises disabled issue trackers", () => {
    expect(issueErrorMessage("github.com 410: Issues are disabled for this repo")).toBe("hub.issue.errDisabled");
    expect(issueErrorMessage("bitbucket.org 404: Repository has no issue tracker.")).toBe("hub.issue.errDisabled");
  });

  it("maps missing write permission and not found", () => {
    expect(issueErrorMessage("github.com 403: Resource not accessible by personal access token")).toBe("hub.issue.errNoPermission (Resource not accessible by personal access token)");
    expect(issueErrorMessage(new Error("gitlab.com 404: 404 Project Not Found"))).toBe("hub.issue.errNotFound (404 Project Not Found)");
  });

  it("passes other errors through", () => {
    expect(issueErrorMessage("github.com 422: Validation Failed")).toBe("github.com 422: Validation Failed");
    expect(issueErrorMessage("github.com: connection refused")).toBe("github.com: connection refused");
    expect(issueErrorMessage("gitlab.com 401: 401 Unauthorized")).toBe("gitlab.com 401: 401 Unauthorized");
  });
});
