import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { compareBranchesDisplay } from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, GitBranch, X } from "lucide-react";
import { useState } from "react";

export function BranchMultiSelect({
  branches,
  selectedBranches,
  onSelectionChange,
}: {
  branches: Branch[];
  selectedBranches: ReadonlySet<string>;
  onSelectionChange: (names: ReadonlySet<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const sorted = [...branches].sort(compareBranchesDisplay);
  const local = sorted.filter((b) => !b.is_remote);
  const remote = sorted.filter((b) => b.is_remote);

  const toggleBranch = (name: string) => {
    const next = new Set(selectedBranches);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onSelectionChange(next);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(new Set());
  };

  const count = selectedBranches.size;
  let label = "Alle Branches";
  if (count === 1) label = "1 Branch";
  else if (count > 1) label = `${count} Branches`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs font-normal",
            count > 0 && "border-primary/40 bg-primary/5",
          )}
        >
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate max-w-56">{label}</span>
          {count > 0 ? (
            <X
              className="size-3 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            />
          ) : (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder="Branch suchen …" />
          <CommandList>
            <CommandEmpty>Keine Branches gefunden.</CommandEmpty>
            {local.length > 0 && (
              <CommandGroup heading="Lokal">
                {local.map((b) => (
                  <BranchCommandItem
                    key={b.name}
                    branch={b}
                    selected={selectedBranches.has(b.name)}
                    onToggle={toggleBranch}
                  />
                ))}
              </CommandGroup>
            )}
            {local.length > 0 && remote.length > 0 && <CommandSeparator />}
            {remote.length > 0 && (
              <CommandGroup heading="Remote">
                {remote.map((b) => (
                  <BranchCommandItem
                    key={b.name}
                    branch={b}
                    selected={selectedBranches.has(b.name)}
                    onToggle={toggleBranch}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BranchCommandItem({
  branch,
  selected,
  onToggle,
}: {
  branch: Branch;
  selected: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <CommandItem
      value={branch.name}
      onSelect={() => onToggle(branch.name)}
      data-checked={selected || undefined}
    >
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{
          backgroundColor: branch.is_current
            ? "var(--color-primary)"
            : "var(--color-muted-foreground)",
          opacity: branch.is_current ? 1 : 0.5,
        }}
      />
      <span className="flex-1 truncate">{branch.name}</span>

    </CommandItem>
  );
}
