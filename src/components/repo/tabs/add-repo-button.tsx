import { usePickRepo } from "@/lib/use-pick-repo";
import { AnimatePresence, motion } from "motion/react";
import { Download, FolderGit2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CloneRepoDialog } from "./clone-repo-dialog";

export function AddRepoButton() {
  const pickRepo = usePickRepo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        title="Repository hinzufügen"
        aria-label="Repository hinzufügen"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                void pickRepo();
              }}
            >
              <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Lokales Repo öffnen</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                setCloneOpen(true);
              }}
            >
              <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Repository klonen…</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <CloneRepoDialog open={cloneOpen} onClose={() => setCloneOpen(false)} />
    </div>
  );
}
