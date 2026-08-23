# Mobile Design System („Social-Dark“)

Referenz: schwarzer Canvas, Glass-Pills/-Kreise, große runde Karten mit Bild + Fade, runde Avatare, weiße CTA-Pille, schwebende Pill-Tab-Bar.

## Grundregeln
- Canvas `bg-background` (#000). Flächen `bg-card` (#16161a) **ohne Border**, Radius `rounded-3xl` (24) für Listen-Gruppen, `rounded-[28px]` für Karten/Sektionen, `rounded-full` für Buttons/Chips/Inputs.
- Keine Hairline-Borders um Karten. Trennlinien innerhalb einer Karte: `border-white/5`.
- Schrift: Titel `text-3xl font-bold tracking-tight`, Sektions-Label `text-base font-semibold` (+ `text-muted-foreground text-sm` Zähler), Meta `text-xs`/`text-2xs text-muted-foreground`, Zahlen `fontVariant: ['tabular-nums']`.
- Abstände: Screen-Padding `px-5`, Karten-Innenabstand `px-4/px-5 py-3.5`, Listen-Gap `gap-3`.
- Icons: lucide, 14–20 px, `palette.foreground` / `palette.mutedForeground`. Namen vor Nutzung prüfen (`node_modules/lucide-react-native/dist/types/icons.d.ts`).

## Primitives (`components/ui/glass.tsx`)
- `Glass` — BlurView-Fläche (rgba(255,255,255,.10), Hairline rgba(255,255,255,.18)); **nur `style`, kein className**.
- `GlassCircle {icon,label,size=44,badge,onPress}` — runder Icon-Button (Header-Aktionen, Back).
- `GlassPill {icon,label,onPress}` — 38 px Pille (sekundäre Aktionen).
- `SolidPill {icon,label,onPress,disabled}` — weiße 54 px CTA-Pille (primäre Aktion, unten/zentral).
- `Fade {height,top,color}` — LinearGradient-Fade zu Schwarz über Bildern.
- Bilder: `expo-image` mit `contentFit="cover"`, optional `blurRadius` für Backdrops; `illustrations`/`illustrationsLarge` aus `lib/illustrations.ts`.

## Muster
- **Header**: links `GlassCircle` (Back/Settings), rechts 1–3 `GlassCircle`; kein Border-Bottom. Tab-Screens: großer Titel links + `GlassCircle`s rechts.
- **Profil-Header** (Detailseiten): Blur-Backdrop + `Fade`, rundes Avatar 92 px mit `rgba(255,255,255,.28)`-Ring, Name, Meta-Zeile, Stats-Reihe (3 Spalten, `rgba(255,255,255,.06)` Fläche, Radius 22), Chips-Reihe (aktiv = `bg-primary` + `text-primary-foreground`, sonst `Glass`).
- **Karten mit Bild**: `Image` absolut + `LinearGradient ['transparent', rgba(0,0,0,.55), rgba(0,0,0,.96)]`, Text unten links, Chips oben links als kleine `Glass`.
- **Listen**: `PressableRow`/`RowGroup` (bereits randlos, rounded-3xl), Avatare rund (`borderRadius = size/2`).
- **Status-Ringe**: online `palette.success`, connecting `palette.warning`, offline `rgba(255,255,255,.18)`.
- **Inputs**: Glass-Pille (`Glass` Höhe 46, Radius 23) oder `bg-card rounded-3xl`. Buttons: `rounded-full`.
- **Sheets/Dialoge**: `bg-card rounded-[28px]` ohne Border, Griff-Strich `bg-white/15`, primäre Aktion als `SolidPill`.
- **Chat**: Transkript direkt auf geblurtem Hintergrund, User-Bubble `bg-primary rounded-3xl rounded-br-lg`, Composer = `GlassCircle` + `Glass`-Eingabe + weißer Senden-Kreis.

## Fallstricke
- `Pressable` mit Style-Funktion + `transform` in Kombination mit reanimated-`layout` hat Kacheln zerquetscht → feste Style-Objekte.
- `BlurView` (Glass) nimmt kein `className`; Kinder brauchen eigene Styles.
- Metro nie mit `CI=1` starten (Watcher aus). Screenshots: `MW_ROUTES=/,/repos bunx mobilewright test shots` (mobile/), Ausgabe `/tmp/mw-shots`.
