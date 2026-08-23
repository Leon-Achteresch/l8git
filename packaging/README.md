# Paket-Kanaele

Manifeste fuer die Distributionskanaele von l8git. **Das Publizieren ist bewusst manuell** -
hier liegen nur die Vorlagen, die pro Release aktualisiert und in das jeweilige Zielrepo
kopiert werden.

| Kanal | Datei(en) | Artefakt | Zielrepo |
| --- | --- | --- | --- |
| Homebrew (macOS) | `homebrew/l8git.rb` | `l8git_<version>_universal.dmg` | `Leon-Achteresch/homebrew-tap` |
| winget (Windows) | `winget/*.yaml` | `l8git_<version>_x64_en-US.msi` | `microsoft/winget-pkgs` (PR) |
| AUR (Arch Linux) | `aur/PKGBUILD`, `aur/.SRCINFO` | `l8git_<version>_amd64.deb` | `aur.archlinux.org/l8git-bin.git` |
| Flatpak (Linux) | `flatpak/com.leon.l8git.yml` | `l8git_<version>_amd64.deb` | `flathub/com.leon.l8git` (PR) |

## Woher die Artefaktnamen kommen

- `src-tauri/tauri.conf.json`: `productName: "l8git"`, `identifier: "com.leon.l8git"`,
  `bundle.targets: "all"`, `createUpdaterArtifacts: true`.
- `.github/workflows/release.yml`: Tag-Schema `v__VERSION__`, Release-Name `l8git v__VERSION__`,
  Matrix `macos-latest --target universal-apple-darwin` und `windows-latest` (ohne `--target`, also x64).
  Die Version wird von `.github/scripts/compute-release-version.mjs` als `<major>.<minor>.<commit-count>`
  berechnet - daher die `v0.5.x`-Reihe.
- Tauri-Namensschema daraus:
  - macOS: `l8git_<version>_universal.dmg` (plus `l8git.app` im DMG)
  - Windows: `l8git_<version>_x64_en-US.msi` (WiX) und `l8git_<version>_x64-setup.exe` (NSIS)
  - Linux (sobald gebaut): `l8git_<version>_amd64.deb`, `l8git_<version>_amd64.AppImage`
- Updater: `includeUpdaterJson: true` erzeugt `latest.json` neben den Bundles,
  `updaterJsonPreferNsis: true` laesst den Windows-Eintrag auf das NSIS-Setup zeigen.
  `latest.json` ist **nur** fuer den In-App-Updater, nicht fuer diese Kanaele.

> Die exakten Namen vor dem ersten Publizieren einmal gegen ein echtes Release pruefen:
> `gh release view v0.5.x --repo Leon-Achteresch/l8git --json assets --jq '.assets[].name'`

## Blocker: Linux-Artefakte fehlen

Die Release-Matrix in `.github/workflows/release.yml` enthaelt **nur** `macos-latest` und
`windows-latest`. Es wird also kein `.deb`, kein `.AppImage` und kein `.rpm` veroeffentlicht.
Homebrew und winget funktionieren sofort; **AUR und Flatpak koennen erst live gehen, wenn ein
`ubuntu-*`-Runner in der Matrix ergaenzt wurde** (inkl. der Tauri-Linux-Systempakete
`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`).
Bis dahin sind die beiden Manifeste hier Vorbereitung, kein lauffaehiger Kanal.

## sha256 ermitteln

Alle Manifeste enthalten `000...0`-Platzhalter (64 Nullen). Sie muessen pro Release durch die
echten Hashes ersetzt werden.

**Ohne Download**, direkt aus den Release-Metadaten (GitHub liefert seit 2025 pro Asset ein
`digest`-Feld):

```bash
gh api repos/Leon-Achteresch/l8git/releases/tags/v0.5.7 \
  --jq '.assets[] | "\(.digest // "kein digest")  \(.name)"'
```

**Mit Download** (immer moeglich, unabhaengig vom `digest`-Feld):

```bash
gh release download v0.5.7 --repo Leon-Achteresch/l8git --dir /tmp/l8git-0.5.7
shasum -a 256 /tmp/l8git-0.5.7/*        # macOS
sha256sum      /tmp/l8git-0.5.7/*        # Linux
certutil -hashfile l8git_0.5.7_x64_en-US.msi SHA256   # Windows
```

**Automatisch patchen** (siehe unten): `scripts/update-packaging.mjs`.

## Pro Release aktualisieren

| Datei | Felder |
| --- | --- |
| `homebrew/l8git.rb` | `version`, `sha256` (DMG) |
| `winget/LeonAchteresch.l8git.yaml` | `PackageVersion` |
| `winget/LeonAchteresch.l8git.installer.yaml` | `PackageVersion`, `InstallerUrl`, `InstallerSha256`, `ReleaseDate`, ggf. `ProductCode` |
| `winget/LeonAchteresch.l8git.locale.en-US.yaml` | `PackageVersion`, `ReleaseNotesUrl` |
| `aur/PKGBUILD` | `pkgver`, `pkgrel=1`, `sha256sums` (deb + LICENSE) |
| `aur/.SRCINFO` | wird aus dem PKGBUILD generiert |
| `flatpak/com.leon.l8git.yml` | `url` und `sha256` der deb-Quelle |

---

## Kanal 1: Homebrew Cask

Einmalig: Repo `Leon-Achteresch/homebrew-tap` anlegen (der Name **muss** mit `homebrew-` beginnen)
mit Ordner `Casks/`.

Pro Release:

```bash
# 1. Version/sha256 aktualisieren (manuell oder per Script)
node scripts/update-packaging.mjs --release release.json

# 2. In den Tap kopieren
cp packaging/homebrew/l8git.rb ../homebrew-tap/Casks/l8git.rb

# 3. Lokal pruefen
brew audit --cask --new ../homebrew-tap/Casks/l8git.rb
brew style ../homebrew-tap/Casks/l8git.rb
brew install --cask ../homebrew-tap/Casks/l8git.rb
brew uninstall --cask l8git

# 4. Committen und pushen
```

Endnutzer: `brew tap Leon-Achteresch/tap && brew install --cask l8git`

Hinweise:
- `sha256 :no_check` ist als Uebergang moeglich (im Cask dokumentiert), deaktiviert aber die
  Integritaetspruefung. Nur im eigenen Tap, nie fuer homebrew/cask.
- Die App ist nicht notarisiert; das Cask entfernt deshalb im `postflight` das
  Quarantaene-Attribut. Sobald Notarisierung im Release-Workflow eingerichtet ist, diesen Block
  entfernen.
- Ein Eintrag in `homebrew/homebrew-cask` selbst verlangt zusaetzlich eine gewisse
  Projekt-Reichweite (Sterne/Alter) - der eigene Tap ist der realistische Weg.

## Kanal 2: winget

Voraussetzung: Microsoft-Konto mit GitHub-Fork von `microsoft/winget-pkgs`, optional
`wingetcreate` (`winget install Microsoft.WingetCreate`).

Bequemer Weg (erzeugt und validiert die Manifeste selbst, laedt das MSI und rechnet den Hash):

```powershell
wingetcreate update LeonAchteresch.l8git --version 0.5.7 `
  --urls https://github.com/Leon-Achteresch/l8git/releases/download/v0.5.7/l8git_0.5.7_x64_en-US.msi `
  --submit --token <github-pat>
```

Manueller Weg mit den Manifesten aus diesem Ordner:

```powershell
# 1. Fork klonen, Zielordner anlegen
#    manifests/l/LeonAchteresch/l8git/0.5.7/
# 2. Die drei YAMLs hineinkopieren und Version/URL/Hash setzen
# 3. Validieren und lokal testen
winget validate --manifest manifests\l\LeonAchteresch\l8git\0.5.7
winget install --manifest manifests\l\LeonAchteresch\l8git\0.5.7
# 4. Branch pushen und PR gegen microsoft/winget-pkgs oeffnen
```

Hinweise:
- Der erste PR erfordert zusaetzlich das `version`-Manifest; danach reicht pro Release ein neuer
  Versionsordner - alte Versionsordner bleiben stehen.
- `ProductCode` im Installer-Manifest ist derzeit auskommentiert, weil er nur aus dem gebauten
  MSI ablesbar ist. `wingetcreate` traegt ihn automatisch ein; ohne ihn erkennt winget ein
  bestehendes Setup unter Umstaenden nicht als dasselbe Paket.
- Die Bundles sind nicht codesigniert. Die automatische Validierung von winget-pkgs meldet das
  (SmartScreen/Defender-Warnungen), blockiert aber nicht zwingend.

## Kanal 3: AUR

Voraussetzung: AUR-Konto mit hinterlegtem SSH-Key, `base-devel`, `pacman-contrib` (fuer
`updpkgsums`), `namcap`.

```bash
git clone ssh://aur@aur.archlinux.org/l8git-bin.git
cp packaging/aur/PKGBUILD l8git-bin/
cd l8git-bin

# Version setzen, Hashes ziehen, .SRCINFO regenerieren
updpkgsums
makepkg --printsrcinfo > .SRCINFO

# Bauen und pruefen
makepkg -si
namcap PKGBUILD
namcap l8git-bin-*.pkg.tar.zst

git add PKGBUILD .SRCINFO
git commit -m "upgpkg: l8git-bin 0.5.7-1"
git push
```

Hinweise:
- Paketname ist `l8git-bin`, weil ein Binaerartefakt installiert wird (AUR-Konvention).
- `.SRCINFO` niemals von Hand pflegen, immer `makepkg --printsrcinfo` - der Server lehnt einen
  Push mit abweichender `.SRCINFO` ab. Die Datei hier ist nur die Startversion.
- Quelle ist bewusst das `.deb` und nicht das AppImage (Begruendung steht im PKGBUILD).
- `depends` sind aus `src-tauri/Cargo.lock` abgeleitet (webkit2gtk-4.1, dbus/secret-service fuer
  `keyring`, `git` als Laufzeitabhaengigkeit). Nach dem ersten echten Build mit
  `namcap` gegenpruefen und korrigieren.

## Kanal 4: Flatpak / Flathub

Der Kanal ist am weitesten von "fertig" entfernt. Die konkreten Blocker stehen als Kommentarblock
oben in `flatpak/com.leon.l8git.yml` (kein Linux-Artefakt, webkit2gtk-4.1 vs. Runtime-Version,
fehlendes `git` in der Sandbox, Terminal/CLI-Agents, Updater, fehlende AppStream-Datei).

Lokal bauen und testen (auf einem Linux-Rechner):

```bash
flatpak install -y flathub org.gnome.Platform//47 org.gnome.Sdk//47
flatpak install -y flathub org.flatpak.Builder
flatpak run org.flatpak.Builder --user --install --force-clean \
  build-dir packaging/flatpak/com.leon.l8git.yml
flatpak run com.leon.l8git

# Flathub-Linter (das ist die Huerde, die die Submission entscheidet)
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest \
  packaging/flatpak/com.leon.l8git.yml
```

Submission:

1. `com.leon.l8git.metainfo.xml` (AppStream, inkl. Screenshots und `<releases>`) schreiben -
   ohne die Datei ist eine Submission chancenlos.
2. Fork von `flathub/flathub`, Branch `new-pr`, darin nur `com.leon.l8git.yml`
   (+ metainfo, + evtl. Offline-Sources) ablegen.
3. PR gegen `flathub/flathub`, Branch `new-pr` oeffnen. Der Bot baut und lintet; ein Reviewer
   fragt erfahrungsgemaess genau die oben dokumentierten Punkte ab (Sandbox-Rechte,
   vorkompiliertes Binary, Updater).
4. Nach Freigabe wird `flathub/com.leon.l8git` angelegt; ab dann laeuft jedes Release ueber einen
   PR/Push in dieses Repo (Version + sha256 anpassen).

---

## Hilfsscript

`scripts/update-packaging.mjs` patcht Version und sha256 in alle Manifeste. Reines Node, keine
Dependencies.

```bash
# Release-Metadaten holen
gh api repos/Leon-Achteresch/l8git/releases/latest > release.json

# Erst schauen, was passieren wuerde
node scripts/update-packaging.mjs --release release.json --dry-run

# Dann schreiben
node scripts/update-packaging.mjs --release release.json

# Ohne digest-Feld: Artefakte herunterladen und lokal hashen
gh release download v0.5.7 --repo Leon-Achteresch/l8git --dir /tmp/l8git
node scripts/update-packaging.mjs --release release.json --artifacts /tmp/l8git

# Oder aus einer Checksummen-Datei
node scripts/update-packaging.mjs --release release.json --checksums SHA256SUMS

node scripts/update-packaging.mjs --help
```

Was es **nicht** kann und was danach von Hand zu tun ist:

- `.SRCINFO` bleibt eine gepatchte Kopie - vor dem AUR-Push trotzdem
  `makepkg --printsrcinfo > .SRCINFO` laufen lassen.
- Der zweite Hash im PKGBUILD (LICENSE aus dem Tag) wird nicht gesetzt -> `updpkgsums`.
- `ProductCode` im winget-Installer-Manifest bleibt leer.
- Fehlt ein Artefakt im Release (aktuell: alles Linux), bleibt der jeweilige Hash unveraendert
  und das Script warnt.
