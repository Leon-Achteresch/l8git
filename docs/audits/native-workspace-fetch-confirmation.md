# F02 · Native Workspace-Bestätigung unter macOS

Den Lauf auf dem zugeteilten macOS-Prüfplatz mit dem bestehenden lokalen Cargo-Cache ausführen. Der Launcher erzeugt ein eigenes temporäres App-Bundle mit eindeutiger Prozessidentität, ein frisches Profil und drei synthetische Git-Repositories. Beide Ziel-Repositories haben ausschließlich einen lokalen Datei-Remote. Der Host sperrt IP-Verkehr und Schreibzugriffe auf die Repositories. `agent-desktop` bedient das echte Ordner-Sheet und erfasst nur das Fenster des eigenen Fixture-Prozesses.

```sh
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 GOMAXPROCS=2 ./node_modules/.bin/vite build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py --workspace-fetch --screenshots /path/to/existing/output
```

## Ergebnis

Der Produktionsrenderer öffnete **Activity & recovery → Workspace fetch preview → Confirm targets**. Der tatsächliche Tauri-Dialog bestätigte genau den vorgesehenen Checkout. Die regulären nativen Kommandos lehnten das Prüfen vor der Bestätigung, eine alte Revision und einen zweiten Checkout ab. Der Workspace-Wechsel entzog Revision 1. Eine erneute Bestätigung ergab Revision 5. Das Schließen des Repo-Tabs entzog diese Revision und entfernte den Checkout aus der Vorschau.

Der finale Lauf protokollierte 127 Git-Prozesse einschließlich lokaler Zielvalidierung. Fetch- und Upload-Pack-Starts fehlten. 81 Dateien blieben nach Bytes und Modus unverändert. HEAD, Refs, Status und die synthetischen Remotes waren in der unabhängigen Git-Prüfung gleich. Der eigene Prozess 18667 endete. Temporäre Repositories, Trace und Profil wurden gelöscht.

Die Katalogbilder zeigen vier Zustände aus diesem Lauf:

- `F02-native-preview.png` zeigt das geprüfte Vorschauziel vor der nativen Bestätigung.
- `F02-native-confirmed.png` zeigt die passende Zielprüfung nach der nativen Bestätigung.
- `F02-native-revoked.png` zeigt den neuen Workspace nach dem Widerruf.
- `F02-native-repo-closed.png` zeigt die leere Vorschau nach dem Schließen des Repo-Tabs.

Die erste Probe des kompilierten nackten Binarys konnte mit AX gelesen werden, die Eingabe scheiterte aber an einem widersprüchlichen Prozessnamen. Das eindeutige temporäre App-Bundle löst diese Zuordnung. Spätere Vorproben führten zu zwei rein visuellen Verbesserungen der Erfassung: Der Screenshot wartet auf die Dialoganimation und der Harness lässt die regulären lesenden Bisect- und History-Abfragen zu.

Der Nutzerpfad im WKWebView bestätigt und validiert Ziele. Ausführung, Retry und Abbruch gegen Datei-Remotes bleiben im getrennten Headless-Nachweis. Der produktive Sammelstart ist gesperrt. Es fehlen der reguläre fenstergebundene Ausführungs- und Fortschrittspfad sowie dessen Abnahme. Anderes Packaging, Linux-Desktop, Linux-CLI-Keyring und Windows-Reservierung bleiben separat.
