import { invoke } from "@tauri-apps/api/core";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CommitNote = { notesRef: string } & (
  | { status: "text"; text: string }
  | { status: "missing" | "unsupported" | "too_large" }
);

type NoteState = CommitNote | { status: "idle" | "loading" | "error" };

export function CommitInspectNote({ path, commit }: { path: string; commit: string }) {
  const { t } = useTranslation();
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<NoteState>({ status: "idle" });

  async function loadNote() {
    setNote({ status: "loading" });
    try {
      const result = await invoke<CommitNote>("repo_commit_note", { path, commit });
      setNote(result);
    } catch {
      setNote({ status: "error" });
    }
  }

  return (
    <section className="shrink-0 border-b border-border/60 px-3 py-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setOpen(!open);
          if (!open && note.status !== "loading") void loadNote();
        }}
      >
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0", open && "rotate-90")} />
        {t("commitInspect.localNote.title")}
      </button>
      <div id={contentId} hidden={!open} className="space-y-1.5 px-1 pb-1 pt-1.5 text-xs text-muted-foreground">
        {"notesRef" in note && <code className="block break-all text-[11px]">{note.notesRef}</code>}
        {note.status === "loading" && <p role="status">{t("common.loading")}</p>}
        {note.status === "missing" && <p role="status">{t("commitInspect.localNote.missing")}</p>}
        {note.status === "unsupported" && <p role="status">{t("commitInspect.localNote.unsupported")}</p>}
        {note.status === "too_large" && <p role="status">{t("commitInspect.localNote.tooLarge")}</p>}
        {note.status === "error" && (
          <>
            <p role="status">{t("commitInspect.localNote.failed")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadNote()}>
              {t("common.retry")}
            </Button>
          </>
        )}
        {note.status === "text" && note.text === "" && <p role="status">{t("commitInspect.localNote.empty")}</p>}
        {note.status === "text" && note.text !== "" && (
          <pre
            tabIndex={0}
            aria-label={t("commitInspect.localNote.title")}
            className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-2 font-mono text-xs"
          >
            {note.text}
          </pre>
        )}
      </div>
    </section>
  );
}
