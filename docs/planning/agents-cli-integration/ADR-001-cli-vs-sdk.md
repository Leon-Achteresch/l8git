# ADR-001: CLI-Protokoll-Transport vs. Agent-SDK-Sidecar

Status: Angenommen
Datum: 2026-09-09
Referenz: t3code `6c583620ff7ad3235b135af7107c0543467eecfa` (ProviderDriver.ts, ProviderAdapter.ts, providerInstance.ts, builtInDrivers.ts)

## Kontext

l8git startet Claude Code, Codex, Cursor, OpenCode, Gemini und Copilot als
Subprozesse aus `src-tauri/src/agent_transport.rs` und spricht deren
stream-json/ACP/App-Server-Protokolle direkt. t3code nutzt stattdessen
teilweise ein Node-SDK (`@anthropic-ai/claude-agent-sdk` u.ä.) als Sidecar-Prozess,
das die Rohprotokolle kapselt.

Zur Diskussion steht, ob l8git für neue Provider (oder bestehende) auf einen
SDK-Sidecar wechseln soll, statt den bestehenden Rust-Transport zu erweitern.

## Vergleich

| Kriterium | Direkter stream-json-Adapter (Rust-Transport) | SDK-Sidecar |
| --- | --- | --- |
| Prozesshoheit | Tauri-Prozess startet/überwacht CLI direkt, ein Supervisor | Zusätzlicher Node-Prozess pro Sidecar, zweite Überwachungsebene |
| Packaging | Kein zusätzliches Runtime-Bundle, nur das CLI-Binary | Node-Runtime + SDK-Pakete müssen mitausgeliefert werden (Bundle-Größe, Codesigning) |
| Control-Protokoll | l8git kontrolliert stream-json/ACP-Framing vollständig, volle Sichtbarkeit auf Turns/Approvals | SDK abstrahiert Framing, l8git ist von SDK-Release-Zyklus abhängig |
| Testbarkeit | Fixtures/Replays direkt gegen stream-json, keine zusätzliche Laufzeit nötig | Erfordert Node-Testharness zusätzlich zur Rust/TS-Testkette |
| Plattformen | Folgt den Tauri-Zielplattformen (macOS/Windows/Linux) 1:1 | Zusätzliche Node-Kompatibilitätsmatrix pro Zielplattform |

## Entscheidung

Standardempfehlung bleibt der vorhandene Rust-Transport
(`src-tauri/src/agent_transport.rs`) als alleiniger Provider-Transport. Für
jede SDK-Operation, die aktuell von den nativen Adaptern
(`src/lib/agents/providers/*`) gebraucht wird, existiert ein CLI-Äquivalent im
jeweiligen stream-json/ACP/App-Server-Protokoll (Initialize, Turn senden,
Steer, Interrupt, Stop, Approvals, Fragen, Resume). Es ist keine Lücke belegt,
die einen SDK-Sidecar rechtfertigt.

Ein SDK-Sidecar würde eine zweite Prozess- und Packaging-Ebene einführen, ohne
einen der oben genannten Kriterien zu verbessern. Ein Wechsel auf einen
Sidecar für einzelne Provider ist möglich, erfordert aber einen begründeten
Nachtrag zu diesem ADR mit der konkret belegten Lücke (z. B. eine
SDK-Operation ohne CLI-Äquivalent).

## Konsequenzen

- Neue Provider-Adapter werden gegen den bestehenden `AgentProviderAdapter`-
  Vertrag (`src/lib/agents/types.ts`) implementiert und sprechen ihr natives
  CLI-Protokoll über den Rust-Transport.
- Kein Sidecar-Prozess, kein zusätzliches Node-Bundling in der Tauri-App.
