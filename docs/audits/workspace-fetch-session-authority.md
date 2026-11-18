# F02 · Sitzungsgebundene Workspace-Autorität

Der headless Host registriert die Verbindung nach erfolgreicher Authentifizierung. Nur der Host installiert eine Workspace-Mitgliedschaft mit den tatsächlich geöffneten Checkouts. Eine Installation entzieht zuerst die bisherige Mitgliedschaft. Erst wenn alle Checkouts und Ziele erfasst sind, veröffentlicht der Host den neuen Stand. Entzug, Ablösung oder Verbindungsende während der Erfassung verhindern die Veröffentlichung. Doppelte Einträge für dasselbe Git Common Dir werden abgelehnt.

`__test_workspace_fetch` erhält die serverseitige Verbindungs-ID aus dem Dispatch-Kontext und prüft Workspace, Checkout und Host-Revision. Die allgemeine Repo-Root-Freigabe ist eine zusätzliche Prüfung. Die Renderer-Vorschau erteilt keine Mitgliedschaft. Die Host-Revision bindet einen Start oder Retry an seine ursprüngliche Bestätigung. Nach erneuter Host-Freigabe eines anderen Ziels braucht der neue Start auch die neue Revision.

Der Git-Pfad hält die Repository-Reservierung, prüft Checkout und Common Dir anhand offener Verzeichnisdeskriptoren und liest das effektive Ziel mit URL und Refspec erneut. Direkt vor dem Start prüft er die Host-Mitgliedschaft ein zweites Mal. Die Sperre der Mitgliedschaft bleibt bis zum Spawn-Versuch gehalten und endet vor dem Warten auf Git. Ein Entzug stoppt spätere Starts. Ein bereits gestarteter Git-Prozess folgt dem bestehenden Abbruchvertrag.

```sh
GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ALLOW_PROTOCOL=file CARGO_BUILD_JOBS=2 \
  cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features headless \
  --lib workspace_fetch -- --test-threads=2
```

Die Fixtures verwenden temporäre Repositories mit Datei-Remotes und zwei unabhängig authentifizierte Clients am privaten Loopback-Server. Sie prüfen unter anderem fremde und wiederverbundene Sitzungen, Entzug, alte Revisionen, Retargeting, Refspec-Wechsel, Repository-Austausch und Reservierungskonflikte. Die Ablehnungstests vergleichen den Fetch-Befehlslog. Erfolgreiche Aufrufe prüfen die erwartete Remote-Tracking-Ref.

## Grenze der regulären Route

Die Testautorität und der Testbefehl sind auf macOS-/Linux-Headless-Tests begrenzt. Der erforderliche reguläre Einstieg ist eine native Workspace-Verwaltung, die den aktiven Workspace und geöffnete Checkouts aus einem vertrauenswürdigen Host-Zustand übernimmt. Sie muss die Bestätigungsrevision an die tatsächliche Sitzung ausgeben und sie bei Wechsel, Schließen und Trennung entziehen. Der anschließende Start-/Retry-Einstieg muss diese Revision und die Sitzungszuordnung für den vollständigen Vorgangs- und Abbruchvertrag verwenden. Die bestehende Renderer-Workspace-Liste und die Daemon-Root-Registrierung liefern diesen Lebenszyklus nicht. Der Mehrfach-Fetch bleibt gesperrt.

Externe Git-Prozesse und Konfigurationsschreiber stehen außerhalb der Host-Sperre. Nach der letzten Prüfung kann ein unabhängiger Prozess die Checkout-Zuordnung, Verzeichnisse oder Git-Konfiguration ändern. Git liest Konfiguration beim Kindstart erneut. Die Linux-CLI-Keyring-Abnahme und die Windows-Prozessreservierung behalten ihre eigenen Voraussetzungen.
