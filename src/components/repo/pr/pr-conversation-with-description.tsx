import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PullRequestConversationTab } from "./pull-request-conversation-tab";
import type { PullRequestDetail } from "./pull-request-inspect-detail";

export function PrConversationWithDescription({
  path,
  number,
  detail,
  onCommented,
}: {
  path: string;
  number: number;
  detail: PullRequestDetail;
  onCommented: () => void;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);
  const hasDescription = !!detail.body_markdown.trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {hasDescription && (
        <div className="flex-shrink-0 border-b border-border/60 bg-muted/20 px-4 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Description
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setDescriptionExpanded(!descriptionExpanded)}
            >
              {descriptionExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {descriptionExpanded && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="max-h-60 overflow-y-auto rounded-xl border border-border/60 bg-background/60 p-3 text-[13px] leading-relaxed shadow-2xs backdrop-blur-xs [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono [&_p+p]:mt-2 [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {detail.body_markdown}
                  </ReactMarkdown>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <PullRequestConversationTab
        path={path}
        number={number}
        onCommented={onCommented}
      />
    </div>
  );
}
