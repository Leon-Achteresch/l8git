import { cn } from "@/lib/utils";
import { usePickRepo } from "@/lib/use-pick-repo";
import { Download, FolderGit2, FolderPlus, Plus, type LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, type Variants } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  OverlayPortal,
  useAnchorBox,
} from "@/components/ui/overlay-portal";
import { RepoSourceDialogs } from "./repo-source-dialogs";

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
  },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
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
    transition: { duration: 0.11, ease: [0.4, 0, 1, 1] },
  },
};

export function AddRepoButton() {
  const { t } = useTranslation();
  const pickRepo = usePickRepo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const box = useAnchorBox(menuOpen, wrapRef);

  const menuEntries = useMemo(
    () =>
      [
        {
          Icon: FolderGit2 as LucideIcon,
          label: t("addRepo.openLocal"),
          key: "open",
          action: () => {
            setMenuOpen(false);
            void pickRepo();
          },
        },
        {
          Icon: FolderPlus as LucideIcon,
          label: t("addRepo.createEmpty"),
          key: "init",
          action: () => {
            setMenuOpen(false);
            setInitOpen(true);
          },
        },
        {
          Icon: Download as LucideIcon,
          label: t("addRepo.clone"),
          key: "clone",
          action: () => {
            setMenuOpen(false);
            setCloneOpen(true);
          },
        },
      ] as const,
    [pickRepo, t],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <LayoutGroup>
        <m.button
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
          title={t("addRepo.buttonTitle")}
          aria-label={t("addRepo.buttonAria")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={cn(
            "flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground",
            menuOpen && "rounded-b-none bg-foreground/10 text-foreground",
          )}
        >
          <Plus className="h-4 w-4" />
        </m.button>

        <OverlayPortal>
        <AnimatePresence>
          {menuOpen ? (
            <m.div
              ref={panelRef}
              role="menu"
              variants={menuPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                transformOrigin: "top right",
                top: box?.bottom ?? 0,
                right: box ? window.innerWidth - box.right : 0,
              }}
              className="fixed z-[80] min-w-[200px] overflow-hidden rounded-b-lg rounded-t-none bg-popover py-1 shadow-lg"
            >
              {menuEntries.map(({ Icon, label, action, key }) => (
                <m.button
                  key={key}
                  type="button"
                  role="menuitem"
                  variants={menuItemVariants}
                  style={{ transformOrigin: "50% 0%" }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  onClick={action}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{label}</span>
                </m.button>
              ))}
            </m.div>
          ) : null}
        </AnimatePresence>
        </OverlayPortal>
        <RepoSourceDialogs
          cloneOpen={cloneOpen}
          initOpen={initOpen}
          onCloseClone={() => setCloneOpen(false)}
          onCloseInit={() => setInitOpen(false)}
        />
      </LayoutGroup>
    </div>
  );
}
