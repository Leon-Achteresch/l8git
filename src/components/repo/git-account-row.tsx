import { useState } from "react";
import { CheckCircle2, LogOut, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import type { GitAccount } from "@/lib/git-accounts";
import { cn } from "@/lib/utils";

type Props = {
  account: GitAccount;
  onSignOut: (host: string, username: string | null) => Promise<void>;
  onRemoveCustom?: (host: string) => void;
};

export function GitAccountRow({ account, onSignOut, onRemoveCustom }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await onSignOut(account.host, account.username);
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid size-9 place-items-center rounded-md border border-border text-xs font-semibold uppercase",
            account.signed_in
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {account.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{account.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {account.host}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>
              Angemeldet
              {account.username ? ` als ${account.username}` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={busy}
          >
            <LogOut />
            Abmelden
          </Button>
          {!account.builtin && onRemoveCustom && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemoveCustom(account.host)}
              aria-label="Host entfernen"
              disabled={busy}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
