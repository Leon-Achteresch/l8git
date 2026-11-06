import { useMemo } from "react";

import { workflowScope } from "@/lib/change-workflow/model";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";

/** GitHub account + repository when resolvable, else the local repository path. Null while loading. */
export function useWorkflowScope(path: string): string | null {
  const target = useGithubTarget(path);
  return useMemo(() => {
    if (isTarget(target)) return workflowScope("github", target.host, target.account.login, target.fullName);
    return target.reason === "loading" ? null : workflowScope("local", "", "", path);
  }, [target, path]);
}
