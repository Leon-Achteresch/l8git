# l8git

**Desktop-Git-Client** für mehrere Repos auf einmal — Commits, Branches, Stashes, Pull Requests und CI in einer ruhigen, schnellen Oberfläche. Gebaut mit **Tauri 2**, **React 19** und **TypeScript**.

---

## Für Entwickler

### Voraussetzungen

- [Bun](https://bun.sh) (Paketmanager und Runtime)
- [Rust](https://rustup.rs) mit `rustup` (Tauri-Backend)
- **macOS:** Xcode Command Line Tools (`xcode-select --install`) für native Builds
- **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (WebView2 wird typischerweise mitinstalliert)
- **Linux:** je nach Distro WebKitGTK und Entwicklerpakete — siehe [Tauri: Prerequisites](https://v2.tauri.app/start/prerequisites/)

Auf dem Rechner sollte ein funktionierendes `git` im `PATH` liegen; die App spricht Git über die Shell bzw. Backend-Befehle an.

### Repository-Struktur

| Pfad         | Inhalt                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| `src/`       | React-UI, TanStack Router (`routes/`), Zustand-State, UI-Komponenten (`components/`) |
| `src-tauri/` | Rust-Backend: Git-Operationen, PR/CI-Anbindung, Tauri-Commands, Menü                 |
| `public/`    | Statische Assets                                                                     |

TypeScript-Alias: `@/*` → `./src/*` (siehe `tsconfig.json`).

### Erste Schritte

```bash
bun install
bun run tauri dev
```

Startet den Vite-Dev-Server (Port **1420**, `strictPort`) und die Tauri-Desktop-App mit Hot Reload. Änderungen an `src-tauri/` triggern einen Rust-Rebuild.

**Nur Frontend** (ohne natives Shell, z. B. schnelles UI-Debugging im Browser):

```bash
bun run dev
```

Dann im Browser `http://localhost:1420` — Tauri-APIs stehen in dieser Konfiguration nicht zur Verfügung.

### Build & Qualität

Frontend inkl. Typecheck (tsc) und Vite-Production-Build:

```bash
bun run build
```

Desktop-Installer bzw. gebündelte App:

```bash
bun run tauri build
```

Release- und Updater-Artefakte sind in `src-tauri/tauri.conf.json` konfiguriert; CI/Release siehe `.github/workflows/`.

App-Icons aus einer Quell-Grafik neu erzeugen:

```bash
bun run tauri:icon
```

### Tech-Stack (Kurz)

| Bereich         | Technologie                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| UI              | Vite 7, React 19, Tailwind CSS 4, shadcn/ui, Radix, Motion                   |
| Routing / State | TanStack Router, Zustand                                                     |
| Desktop         | Tauri 2, Rust-Backend (`reqwest`, Datei-Watcher, Git über Prozesse/Commands) |

---

_Fragen und PRs willkommen._
