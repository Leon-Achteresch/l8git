import { useEffect, useState } from "react";

import { repoAvatarBackground, repoInitialChar } from "@/lib/repo-avatar";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function RepoLogo({
  path,
  label,
  className,
}: {
  path: string;
  label: string;
  className?: string;
}) {
  const favicon = useRepoStore((s) => s.favicons[path] ?? null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [favicon]);

  const showFavicon = !!favicon && !broken;

  return (
    <span
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded font-mono text-[9px] font-bold text-white",
        className,
      )}
      style={showFavicon ? undefined : { backgroundColor: repoAvatarBackground(label) }}
    >
      {showFavicon ? (
        <img
          src={favicon ?? undefined}
          alt=""
          onError={() => setBroken(true)}
          className="size-full rounded object-contain"
        />
      ) : (
        repoInitialChar(label)
      )}
    </span>
  );
}
