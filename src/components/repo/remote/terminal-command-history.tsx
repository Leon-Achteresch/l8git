import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
        <button
          type="button"
          title={t("embeddedTerminal.history")}
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] hover:bg-foreground/8 hover:text-foreground active:scale-95"
        >
          <History className="size-3.5" />
        </button>
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
                  <button
                    type="button"
                    title={t("embeddedTerminal.historyDelete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(path, entry.cmd);
                    }}
                    className="shrink-0 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {entries.length > 0 && (
            <div className="border-t border-border/50 p-1.5">
              <button
                type="button"
                onClick={() => clear(path)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3" />
                {t("embeddedTerminal.historyClear")}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
