import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type AgentCommandPickerItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type AgentCommandPickerState = {
  title: string;
  description?: string;
  items?: AgentCommandPickerItem[];
  detail?: string;
  input?: { placeholder: string; submitLabel: string; defaultValue?: string };
  onSelect?: (id: string) => void;
  onSubmit?: (value: string) => void;
};

export function AgentCommandPicker({
  picker,
  onOpenChange,
}: {
  picker: AgentCommandPickerState | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(picker?.input?.defaultValue ?? "");

  useEffect(() => {
    setValue(picker?.input?.defaultValue ?? "");
  }, [picker]);

  return (
    <Dialog open={picker !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-4">
        <DialogHeader>
          <DialogTitle>{picker?.title}</DialogTitle>
          {picker?.description ? (
            <DialogDescription>{picker.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {picker?.detail ? (
          <pre className="ag-inset max-h-56 overflow-auto whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-4">
            {picker.detail}
          </pre>
        ) : null}
        {picker?.items?.length ? (
          <div className="ag-scroll max-h-80 overflow-y-auto">
            {picker.items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                className="ag-menu-item w-full"
                onClick={() => picker.onSelect?.(item.id)}
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                {item.description ? (
                  <span className="ag-faint min-w-0 max-w-[46%] truncate text-[11px]">
                    {item.description}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {picker?.input ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              picker.onSubmit?.(value.trim());
            }}
          >
            <Input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={picker.input.placeholder}
            />
            <DialogFooter>
              <Button type="submit" size="sm" disabled={!value.trim()}>
                {picker.input.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
