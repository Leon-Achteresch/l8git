import { Badge } from "@/components/ui/badge";

type LabelTone = React.ComponentProps<typeof Badge>["variant"];

const LABEL_TONES: Record<string, LabelTone> = {
  merge: "destructive",
  editor: "info",
  breaking: "destructive",
  bug: "destructive",
  refactor: "info",
  dx: "success",
  ui: "info",
  feature: "success",
  fix: "warning",
  enhancement: "info",
  documentation: "secondary",
};

export function PrLabelChip({ label }: { label: string }) {
  const tone = LABEL_TONES[label.toLowerCase()] ?? "secondary";

  // No mount animation: virtual rows remount as they scroll into view, so it replayed on every scroll.
  return (
    <span>
      <Badge
        variant={tone}
        className="h-5 px-2 text-[0.625rem] font-medium tracking-tight rounded-md border"
      >
        {label}
      </Badge>
    </span>
  );
}
