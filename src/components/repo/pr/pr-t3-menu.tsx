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
  useT3Pr,
  type T3Action,
  type T3Comment,
} from "@/lib/t3-code";
import { Bot, Copy, MessageSquareReply, Settings2, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Hands a review comment (or the whole PR when `comment` is omitted) to a T3 Code thread. */
export function PrT3Menu({ comment, className }: { comment?: T3Comment; className?: string }) {
  const { t } = useTranslation();
  const pr = useT3Pr();
  const [setup, setSetup] = useState<T3Action | "settings" | null>(null);
  const [url, setUrl] = useState("");
  if (!pr) return null;
  const info = pr;

  async function send(action: T3Action) {
    if (!getT3WebhookUrl()) {
      setUrl("");
      setSetup(action);
      return;
    }
    try {
      await sendToT3(action, info, comment);
      toast.success(t("t3.sent"));
    } catch (e) {
      toastError(String(e));
    }
  }

  async function copy(action: T3Action) {
    await navigator.clipboard.writeText(t3Prompt(action, info, comment));
    toast.success(t("t3.copied"));
  }

  function save() {
    setT3WebhookUrl(url);
    const pending = setup;
    setSetup(null);
    if (url.trim() && pending && pending !== "settings") void send(pending);
  }

  const action: T3Action = comment ? "fix" : "review";
  return (
    <>
      <DropdownMenu>
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
          <DropdownMenuItem onSelect={() => void send(action)}>
            <Wrench />
            {comment ? t("t3.fix") : t("t3.review")}
          </DropdownMenuItem>
          {comment && (
            <DropdownMenuItem onSelect={() => void send("reply")}>
              <MessageSquareReply />
              {t("t3.reply")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copy(action)}>
            <Copy />
            {t("t3.copyPrompt")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setUrl(getT3WebhookUrl());
              setSetup("settings");
            }}
          >
            <Settings2 />
            {t("t3.configure")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={setup !== null} onOpenChange={(o) => !o && setSetup(null)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("t3.setupTitle")}</DialogTitle>
            <DialogDescription>{t("t3.setupHint")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={url}
            placeholder="https://…/webhooks/…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetup(null)}>
              {t("t3.cancel")}
            </Button>
            <Button onClick={save}>{t("t3.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
