import { Badge } from "@/components/ui/badge";
import { m } from "motion/react";

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

  return (
    <m.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.12 }}
    >
      <Badge
        variant={tone}
        className="h-5 px-2 text-[10px] font-medium tracking-tight rounded-md border"
      >
        {label}
      </Badge>
    </m.span>
  );
}
