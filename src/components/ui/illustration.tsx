import { m } from "motion/react";

import agentsIdle from "@/assets/illustrations/agents-idle.webp";
import cleanTree from "@/assets/illustrations/clean-tree.webp";
import inboxZero from "@/assets/illustrations/inbox-zero.webp";
import noPullRequests from "@/assets/illustrations/no-pull-requests.webp";
import noStash from "@/assets/illustrations/no-stash.webp";
import welcome from "@/assets/illustrations/welcome.webp";
import { cn } from "@/lib/utils";

const ILLUSTRATIONS = {
  "agents-idle": agentsIdle,
  "clean-tree": cleanTree,
  "inbox-zero": inboxZero,
  "no-pull-requests": noPullRequests,
  "no-stash": noStash,
  welcome,
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <m.span
      aria-hidden
      className={cn("inline-flex size-32 shrink-0", className)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 140 }}
    >
      <img
        src={ILLUSTRATIONS[name]}
        alt=""
        draggable={false}
        className="l8-illustration-drift size-full object-contain"
      />
    </m.span>
  );
}
