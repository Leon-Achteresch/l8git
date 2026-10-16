import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import {
  getT3WebhookUrl,
  sendToT3,
  setT3WebhookUrl,
  t3Prompt,
  type T3Action,
  type T3Comment,
  type T3PrInfo,
} from "@/lib/t3-code";
import { Bot, Copy, MessageSquareReply, Settings2, Wrench } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Pending = { action: T3Action; comment?: T3Comment } | "settings";

type T3Ctx = {
  send: (action: T3Action, comment?: T3Comment) => Promise<void>;
  copy: (action: T3Action, comment?: T3Comment) => Promise<void>;
  configure: () => void;
};

const Ctx = createContext<T3Ctx | null>(null);

/** Owns the one webhook-setup dialog for a PR; rendered outside the comment cards so its events don't bubble into them. */
export function PrT3Provider({ pr, children }: { pr: T3PrInfo | null; children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [url, setUrl] = useState("");

  const ctx = useMemo<T3Ctx | null>(() => {
    if (!pr) return null;
    const send = async (action: T3Action, comment?: T3Comment) => {
      if (!getT3WebhookUrl()) {
        setUrl("");
        setPending({ action, comment });
        return;
      }
      try {
        await sendToT3(action, pr, comment);
        toast.success(t("t3.sent"));
      } catch (e) {
        toastError(String(e));
      }
    };
    return {
      send,
      copy: async (action, comment) => {
        try {
          await navigator.clipboard.writeText(t3Prompt(action, pr, comment));
          toast.success(t("t3.copied"));
        } catch (e) {
          toastError(String(e));
        }
      },
      configure: () => {
        setUrl(getT3WebhookUrl());
        setPending("settings");
      },
    };
  }, [pr, t]);

  function save() {
    setT3WebhookUrl(url);
    const job = pending;
    setPending(null);
    if (url.trim() && job && job !== "settings") void ctx?.send(job.action, job.comment);
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("t3.setupTitle")}</DialogTitle>
            <DialogDescription>{t("t3.setupHint")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={url}
            placeholder="https://…/hooks/…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t("t3.cancel")}
            </Button>
            <Button onClick={save}>{t("t3.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

/** Hands a review comment (or the whole PR when `comment` is omitted) to a T3 Code thread. */
export function PrT3Menu({ comment, className }: { comment?: T3Comment; className?: string }) {
  const { t } = useTranslation();
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const action: T3Action = comment ? "fix" : "review";
  return (
    // Non-modal so the setup dialog can take focus right after the menu closes.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={className ?? "h-6 gap-1 text-[0.625rem]"}
          onClick={(e) => e.stopPropagation()}
          title={t("t3.menu")}
        >
          <Bot className="h-3 w-3" />
          T3
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => void ctx.send(action, comment)}>
          <Wrench />
          {comment ? t("t3.fix") : t("t3.review")}
        </DropdownMenuItem>
        {comment && (
          <DropdownMenuItem onSelect={() => void ctx.send("reply", comment)}>
            <MessageSquareReply />
            {t("t3.reply")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void ctx.copy(action, comment)}>
          <Copy />
          {t("t3.copyPrompt")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={ctx.configure}>
          <Settings2 />
          {t("t3.configure")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
