import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommitHorizontal } from "lucide-react";

export function CommitInspectMessage({ message }: { message: string }) {
  const subject =
    message
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";

  return (
    <Accordion
      type="single"
      collapsible
      className="shrink-0 bg-background/80 px-4 shadow-sm backdrop-blur-sm"
    >
      <AccordionItem value="meta">
        <AccordionTrigger className="py-2.5 hover:no-underline">
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <GitCommitHorizontal
              className="size-4 shrink-0 text-primary"
              aria-hidden
            />
            <span className="sr-only">
              Commit-Nachricht und Metadaten ein- oder ausblenden
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug text-foreground/85">
              {subject || "—"}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ScrollArea className="max-h-[min(50vh,360px)]">
            <pre className="whitespace-pre-wrap break-words pb-1 font-mono text-[11px] leading-relaxed text-foreground/90">
              {message}
            </pre>
          </ScrollArea>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
