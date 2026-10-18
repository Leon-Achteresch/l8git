import { cn } from "@/lib/utils";
import { usePickRepo } from "@/lib/use-pick-repo";
import { Download, FolderGit2, FolderPlus, Plus, type LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, type Variants } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  OverlayPortal,
  useAnchorBox,
} from "@/components/ui/overlay-portal";
import { RepoSourceDialogs } from "./repo-source-dialogs";

const REPO_ADD_MORPH_ID = "add-repo-dialog-surface";

// `up` is the variant `custom`: true when the menu grows upward beside the button.
const menuPanelVariants: Variants = {
  hidden: (up: boolean) => ({
    opacity: 0,
    scaleY: 0.9,
    y: up ? 5 : -5,
  }),
  visible: (up: boolean) => ({
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
      // Reveal items from the button outward.
      staggerDirection: up ? -1 : 1,
    },
  }),
  exit: (up: boolean) => ({
    opacity: 0,
    scaleY: 0.93,
    y: up ? 4 : -4,
    transition: {
      duration: 0.15,
      ease: [0.4, 0, 1, 1],
      staggerChildren: 0.042,
      staggerDirection: up ? 1 : -1,
    },
  }),
};

const menuItemVariants: Variants = {
  hidden: (up: boolean) => ({
    opacity: 0,
    y: up ? 14 : -14,
    scaleY: 0.45,
  }),
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
  exit: (up: boolean) => ({
    opacity: 0,
    y: up ? 6 : -6,
    scaleY: 0.88,
    transition: { duration: 0.11, ease: [0.4, 0, 1, 1] },
  }),
};

/** `side` opens the menu to the right of the button, for the narrow left repo rail. */
export function AddRepoButton({
  placement = "below",
}: {
  placement?: "below" | "side";
}) {
  const { t } = useTranslation();
  const pickRepo = usePickRepo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedByKeyboard = useRef(false);
  const box = useAnchorBox(menuOpen, wrapRef);
  const beside = placement === "side";
  // Offset from the rail's edge, not the centred button, so the menu doesn't cover the rail.
  const [railRight, setRailRight] = useState<number>();
  useLayoutEffect(() => {
    if (beside && box) setRailRight(wrapRef.current?.closest("aside")?.getBoundingClientRect().right);
  }, [beside, box]);
  // Keep focus on the trigger once the menu unmounts instead of dropping it to <body>.
  const closeMenu = () => {
    setMenuOpen(false);
    buttonRef.current?.focus();
  };

  const menuEntries = useMemo(
    () =>
      [
        {
          Icon: FolderGit2 as LucideIcon,
          label: t("addRepo.openLocal"),
          key: "open",
          action: () => {
            closeMenu();
            void pickRepo();
          },
        },
        {
          Icon: FolderPlus as LucideIcon,
          label: t("addRepo.createEmpty"),
          key: "init",
          action: () => {
            closeMenu();
            setInitOpen(true);
          },
        },
        {
          Icon: Download as LucideIcon,
          label: t("addRepo.clone"),
          key: "clone",
          action: () => {
            closeMenu();
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
    // A mouse open focuses the panel itself: WebKit doesn't focus clicked buttons, so keys would miss the menu.
    if (openedByKeyboard.current) menuItems()[0]?.focus();
    else panelRef.current?.focus();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const menuItems = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Bound to the trigger and the panel, so it only sees keys while focus is in the menu.
  const onMenuKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!menuOpen) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = menuItems();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === "Escape") {
      // Stops before the document/window Escape handlers of other panels and popovers.
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    } else if (e.key === "Tab") {
      // Default Tab then moves on from the trigger, like a native menu.
      closeMenu();
    }
  };

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <LayoutGroup>
        <m.button
          ref={buttonRef}
          type="button"
          layoutId={REPO_ADD_MORPH_ID}
          whileTap={{ scale: 0.92 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 28,
            mass: 0.35,
          }}
          onClick={(e) => {
            // detail 0: activated by Enter/Space, so move focus into the menu.
            openedByKeyboard.current = e.detail === 0;
            if (menuOpen) closeMenu();
            else setMenuOpen(true);
          }}
          onKeyDown={onMenuKeyDown}
          title={t("addRepo.buttonTitle")}
          aria-label={t("addRepo.buttonAria")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={cn(
            "flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground",
            menuOpen && "bg-foreground/10 text-foreground",
            menuOpen && !beside && "rounded-b-none",
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
              tabIndex={-1}
              onKeyDown={onMenuKeyDown}
              variants={menuPanelVariants}
              custom={beside}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={
                beside
                  ? {
                      transformOrigin: "bottom left",
                      // Grows upward; the rail button sits low and the window is >= 600px tall.
                      bottom: box ? window.innerHeight - box.bottom : 0,
                      left: (railRight ?? box?.right ?? 0) + 8,
                    }
                  : {
                      transformOrigin: "top right",
                      top: box?.bottom ?? 0,
                      right: box ? window.innerWidth - box.right : 0,
                    }
              }
              className={cn(
                "fixed z-[80] min-w-[200px] overflow-hidden bg-popover py-1 shadow-lg outline-none",
                beside ? "rounded-lg" : "rounded-b-lg rounded-t-none",
              )}
            >
              {menuEntries.map(({ Icon, label, action, key }) => (
                <m.button
                  key={key}
                  type="button"
                  role="menuitem"
                  variants={menuItemVariants}
                  custom={beside}
                  style={{ transformOrigin: beside ? "50% 100%" : "50% 0%" }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
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
