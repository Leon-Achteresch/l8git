import { ScrollArea } from "@/components/ui/scroll-area";

export function CommitInspectMessage({ message }: { message: string }) {
  return (
    <div className="max-h-[35%] shrink-0 bg-background px-5 py-4 shadow-sm">
      <ScrollArea className="max-h-[min(35vh,250px)]">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm font-medium leading-relaxed text-foreground/90">
          {message}
        </pre>
      </ScrollArea>
    </div>
  );
}
