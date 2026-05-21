import {
  CiChecksList,
  type RemoteCiCheck,
} from "@/components/repo/ci/ci-checks-list";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function PullRequestChecksTab({
  path,
  number,
}: {
  path: string;
  number: number;
}) {
  const [checks, setChecks] = useState<RemoteCiCheck[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<RemoteCiCheck[]>("pr_checks", { path, number })
      .then((res) => {
        if (!cancelled) setChecks(res);
      })
      .catch((e) => {
        if (!cancelled) {
          toastError(String(e));
          setChecks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number]);

  return <CiChecksList checks={checks} loading={loading} path={path} />;
}
