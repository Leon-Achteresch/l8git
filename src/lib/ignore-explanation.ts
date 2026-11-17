import { invoke } from "@/lib/platform/ipc";

export type IgnoreExplanation = {
  file: string;
  ignored: boolean;
  rule: { source: string; line: number; pattern: string } | null;
};

export type IgnoreLookupState =
  | { status: "idle" }
  | { status: "loading"; file: string }
  | { status: "ready"; result: IgnoreExplanation }
  | { status: "error"; error: unknown };

/** A dialog owns this request lifetime; edits, close and repo switches cancel publication. */
export function createIgnoreLookup(publish: (state: IgnoreLookupState) => void) {
  let generation = 0;
  return {
    cancel() { generation++; },
    async check(path: string, file: string) {
      const request = ++generation;
      publish({ status: "loading", file });
      try {
        const result = await invoke<IgnoreExplanation>("git_check_ignore", { path, file });
        if (request === generation) publish({ status: "ready", result });
      } catch (error) {
        if (request === generation) publish({ status: "error", error });
      }
    },
  };
}
