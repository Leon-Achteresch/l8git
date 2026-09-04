import { Pencil, Share } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { easeOutSoft, springSoft } from "@/components/motion/kit";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function AgentProfileCover({
  path,
  provider,
  branch,
  threadCount,
  index = 0,
}: {
  path: string;
  provider: NativeAgentProvider;
  branch?: string | null;
  threadCount: number;
  index?: number;
}) {
  const meta = agentProviderMeta(provider);
  const Logo = meta.Logo;
  const name = repoName(path);
  const initials = name.slice(0, 1).toUpperCase();
  // Repo convention: gate `initial` on reduced motion — motion v13 can leave
  // enter animations stuck at opacity 0 when reduced motion is preferred
  // (e.g. headless browsers), so render the final state directly.
  const reduce = useReducedMotion();

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSoft, delay: index * 0.05 }}
    >
      <Card className="gap-0 py-0" data-testid="agent-profile-cover">
        {/* Cover photo — gradient identity band, BoardUI AI-Profile style */}
        <div className="relative h-32 overflow-hidden rounded-t-2xl sm:h-40">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 140% at 12% 20%, #b7c6ff 0%, transparent 45%), radial-gradient(120% 160% at 85% 10%, #e8c8ff 0%, transparent 50%), radial-gradient(140% 140% at 60% 100%, #9fd8c9 0%, transparent 55%), linear-gradient(115deg, #dfe7f5 0%, #cfdcef 40%, #d9cfe8 100%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 dark:opacity-40"
            style={{
              background:
                "radial-gradient(60% 90% at 78% 30%, rgb(255 255 255 / 0.85) 0%, transparent 60%), radial-gradient(50% 80% at 30% 80%, rgb(255 255 255 / 0.5) 0%, transparent 60%)",
            }}
          />
          {/* dotted texture like the template */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "radial-gradient(rgb(20 20 30 / 0.25) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          />
        </div>

        {/* Identity row */}
        <div className="flex flex-wrap items-end gap-4 px-4 pb-4 sm:px-6">
          <m.div
            initial={reduce ? false : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springSoft, delay: 0.08 + index * 0.05 }}
            className="-mt-8 shrink-0"
          >
            <Avatar size="lg" className="size-16 ring-4 ring-card sm:size-20">
              <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                <span className="grid size-full place-items-center rounded-full bg-gradient-to-br from-primary to-primary/60">
                  {initials}
                </span>
              </AvatarFallback>
            </Avatar>
          </m.div>

          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{name}</h2>
              <Badge variant="default" className="uppercase tracking-wide">
                PRO
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              @{meta.label.toLowerCase().replace(/\s+/g, "")}
              {branch ? ` · ${branch}` : ""}
              {` · ${threadCount} threads`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1">
                <Logo className="size-3" />
                {meta.label}
              </Badge>
              {branch ? <Badge variant="outline">{branch}</Badge> : null}
            </div>
          </div>

          <m.div
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...easeOutSoft, delay: 0.12 }}
            className="flex shrink-0 items-center gap-2 pb-1"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(path).then(
                  () => toast.success("Repository path copied"),
                  () => toast.error("Copy failed"),
                );
              }}
            >
              <Share data-icon="inline-start" />
              Share
            </Button>
            <Button variant="default" size="sm" onClick={() => toast.info("Edit profile is decorative in this rebuild")}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </m.div>
        </div>
      </Card>
    </m.div>
  );
}
