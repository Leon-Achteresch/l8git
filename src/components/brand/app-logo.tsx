import { cn } from "@/lib/utils";

export const APP_LOGO_SRC = "/icons/web/icon-512.png";

type AppLogoProps = {
  className?: string;
  imgClassName?: string;
  alt?: string;
};

/**
 * Einheitliches App-Logo: immer rund (kein Rechteck/Kasten) und immer
 * vollständig sichtbar (object-contain, kein object-cover-Cropping).
 *
 * Die Quelle `icon-512.png` ist bereits eine runde PNG mit transparenten
 * Ecken + Safe-Padding, damit der weiße Ring nirgends angeschnitten wird –
 * auch nicht durch ring/shadow oder OS-Masken.
 */
export function AppLogo({ className, imgClassName, alt = "l8git" }: AppLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent",
        className,
      )}
    >
      <img
        src={APP_LOGO_SRC}
        alt={alt}
        draggable={false}
        className={cn("size-full rounded-full bg-transparent object-contain", imgClassName)}
      />
    </span>
  );
}
