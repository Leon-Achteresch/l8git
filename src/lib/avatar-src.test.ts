import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol: string) => `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { avatarSrc } from "@/lib/avatar-src";

describe("avatarSrc", () => {
  it("routes known avatar CDNs through the avatar scheme", () => {
    const url = "https://www.gravatar.com/avatar/ab?s=64&d=404";
    expect(avatarSrc(url)).toBe(`avatar://localhost/${encodeURIComponent(url)}`);
    expect(avatarSrc("https://avatars.githubusercontent.com/u/1?v=4")).toMatch(/^avatar:/);
  });

  it("leaves other URLs alone", () => {
    for (const url of [
      "https://gitlab.example.com/uploads/a.png",
      "http://www.gravatar.com/avatar/ab",
      "https://www.gravatar.com:8443/avatar/ab",
      "https://user@www.gravatar.com/avatar/ab",
      "https://www.gravatar.com.evil.example/x",
      "data:image/png;base64,AA==",
      "not a url",
      "",
      undefined,
    ]) {
      expect(avatarSrc(url)).toBe(url);
    }
  });
});
