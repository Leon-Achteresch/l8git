import { cn } from "@/lib/utils";
import { usePickRepo } from "@/lib/use-pick-repo";
import { Download, FolderGit2, FolderPlus, Plus, type LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Variants } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CloneRepoDialog } from "./clone-repo-dialog";
import { InitRepoDialog } from "./init-repo-dialog";

const REPO_ADD_MORPH_ID = "add-repo-dialog-surface";

const menuPanelVariants: Variants = {
  hidden: {
    opacity: 0,
    scaleY: 0.9,
    y: -5,
  },
  visible: {
    opacity: 1,
    scaleY: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 520,
      damping: 36,
      mass: 0.42,
      delayChildren: 0.05,
      staggerChildren: 0.078,
    },
  },
  exit: {
    opacity: 0,
    scaleY: 0.93,
    y: -4,
    transition: {
      duration: 0.15,
      ease: [0.4, 0, 1, 1],
      staggerChildren: 0.042,
      staggerDirection: -1,
    },
  },
};

const menuItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -14,
    scaleY: 0.45,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 460,
      damping: 26,
      mass: 0.32,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scaleY: 0.88,
    filter: "blur(2px)",
    transition: { duration: 0.11, ease: [0.4, 0, 1, 1] },
  },
};

export function AddRepoButton() {
  const pickRepo = usePickRepo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const menuEntries = useMemo(
    () =>
      [
        {
          Icon: FolderGit2,
          label: "Lokales Repo öffnen",
          action: () => {
            setMenuOpen(false);
            void pickRepo();
          },
        },
        {
          Icon: FolderPlus,
          label: "Leeres Repo anlegen…",
          action: () => {
            setMenuOpen(false);
            setInitOpen(true);
          },
        },
        {
          Icon: Download,
          label: "Repository klonen…",
          action: () => {
            setMenuOpen(false);
            setCloneOpen(true);
          },
        },
      ] as const satisfies ReadonlyArray<{
        Icon: LucideIcon;
        label: string;
        action: () => void;
      }>,
    [pickRepo],
  );

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
    <div className="relative shrink-0 mr-2" ref={wrapRef}>
      <LayoutGroup>
        <motion.button
          type="button"
          layoutId={REPO_ADD_MORPH_ID}
          whileTap={{ scale: 0.92 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 28,
            mass: 0.35,
          }}
          onClick={() => setMenuOpen((o) => !o)}
          title="Repository hinzufügen"
          aria-label="Repository hinzufügen"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground bg-popover transition-colors hover:bg-muted hover:text-foreground",
            menuOpen && "rounded-b-none",
          )}
        >
          <Plus className="h-4 w-4" />
        </motion.button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              variants={menuPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ transformOrigin: "top right" }}
              className="absolute right-0 top-full z-50 min-w-[200px] overflow-hidden rounded-b-lg rounded-t-none bg-popover py-1 shadow-lg"
            >
              {menuEntries.map(({ Icon, label, action }) => (
                <motion.button
                  key={label}
                  type="button"
                  role="menuitem"
                  variants={menuItemVariants}
                  style={{ transformOrigin: "50% 0%" }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  onClick={action}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{label}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <CloneRepoDialog open={cloneOpen} onClose={() => setCloneOpen(false)} />
        <InitRepoDialog open={initOpen} onClose={() => setInitOpen(false)} />
      </LayoutGroup>
    </div>
  );
}
