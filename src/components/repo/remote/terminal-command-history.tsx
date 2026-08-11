import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCommandHistory } from "@/lib/terminal/command-history";
import {
  terminalLeafId,
  writeToSession,
} from "@/lib/terminal/use-terminal-session";
import { History, SquareTerminal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  path: string;
  activeId: string | null;
}

export function TerminalCommandHistory({ path, activeId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const entries = useCommandHistory((s) => s.byPath[path]) ?? [];
  const remove = useCommandHistory((s) => s.remove);
  const clear = useCommandHistory((s) => s.clear);

  const runCommand = (cmd: string) => {
    if (!activeId) return;
    writeToSession(terminalLeafId(path, activeId), cmd);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={t("embeddedTerminal.history")}
          className="size-7 rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
        >
          <History className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 overflow-hidden rounded-2xl p-0 shadow-lg"
      >
        <Command>
          <CommandInput placeholder={t("embeddedTerminal.historySearch")} />
          <CommandList>
            <CommandEmpty>{t("embeddedTerminal.historyEmpty")}</CommandEmpty>
            <CommandGroup>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.cmd}
                  value={entry.cmd}
                  onSelect={() => runCommand(entry.cmd)}
                  className="group"
                >
                  <SquareTerminal className="size-3 shrink-0 text-muted-foreground/70" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {entry.cmd}
                  </span>
                  {entry.count > 1 && (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      ×{entry.count}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={t("embeddedTerminal.historyDelete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(path, entry.cmd);
                    }}
                    className="size-5 shrink-0 rounded-full p-0 opacity-0 hover:bg-muted-foreground/15 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {entries.length > 0 && (
            <div className="border-t border-border/50 p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clear(path)}
                className="h-auto w-full justify-start gap-2 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3" />
                {t("embeddedTerminal.historyClear")}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
