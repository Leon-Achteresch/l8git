# Provider-SPI

Kurzleitfaden für einen fünften (oder n-ten) CLI-Treiber im Agents-Modul. Referenzimplementierung ohne Prozess: `src/lib/agents/providers/fake/client.ts` (`FakeProviderAdapter`), Konformitätstests in `src/lib/agents/__tests__/fake-provider-conformance.test.ts`.

## Interface

Jeder Treiber implementiert `AgentProviderAdapter` aus `src/lib/agents/types.ts`:

```ts
interface AgentProviderAdapter {
  driver: DriverKind;
  start(instance: InstanceId): Promise<NativeSessionRef>;
  send(threadId: ThreadId, text: string): Promise<void>;
  interrupt(threadId: ThreadId): Promise<void>;
  stop(threadId: ThreadId): Promise<void>;
  resume(threadId: ThreadId, ref: NativeSessionRef): Promise<void>;
  capability(name: string): AgentCapability;
  steer?(threadId: ThreadId, text: string): Promise<void>;
  approve?(threadId: ThreadId, requestId: string, approved: boolean): Promise<void>;
  ask?(threadId: ThreadId, question: AgentInputQuestion): Promise<void>;
}
```

`session-manager.ts` und die Chat-Stores kennen nur dieses Interface — kein `if (driver === "...")` an diesen Stellen. Ein neuer Treiber braucht dort keine Änderung, nur Registrierung (siehe unten).

## Pflicht-Capabilities

`capability(name)` muss für jede der fünf zentralen Capabilities (`history`, `approvals`, `models`, `images`, `tools`) einen `AgentCapability`-Status liefern:

- `supported` — Capability funktioniert.
- `unsupported` — bekannte Einschränkung des CLI, **mit `reason`**.
- `unavailable` — unbekannter Capability-Name oder aktuell nicht ansprechbar, **mit `reason`**.

Kein stilles No-op: fehlt eine Fähigkeit, muss das UI es über `capability()` sehen können, nicht durch einen leise erfolgreichen Aufruf. `provider-meta.ts` liest diese Matrix für Slash-Command-Gates und die Capability-Center-Anzeige.

## Event-Mapping

Rohe CLI-Events werden nicht direkt an die UI durchgereicht. Der Treiber normalisiert auf `AgentRuntimeEvent` (`types.ts`): `session`, `turn`, `text`, `tool`, `task`, `approval`, `usage`, `error`, jeweils mit `schemaVersion`, `eventId`, `sequence`, `driver`, `instance`, `threadId`, `nativeSessionId`. Prozessbasierte Treiber (Codex, Claude, OpenCode, Cursor) parsen dafür JSONL aus `openAgentTransport` (`transport.ts`); ein prozessloser Treiber wie `FakeProviderAdapter` kann Fixture-Events direkt aus einer Liste abspielen (`fixture-events.ts`).

## Testpflichten

Jeder Treiber braucht eine Konformitätssuite im Stil von `provider-conformance.test.ts`:

- `capability()` deckt die volle Registry-Matrix ab, jede nicht unterstützte Fähigkeit hat einen `reason`.
- `capability()` lehnt unbekannte Namen ab (kein `supported`).
- `stop()` auf einem unbekannten Thread wirft nicht.
- `interrupt()` auf einem unbekannten Thread: wirft oder löst auf — je nach Treiber, aber konsistent und getestet.
- `send()` auf einem unbekannten Thread lehnt ab (keine still verschluckte Nachricht).

Für Treiber mit optionalen Teilfähigkeiten (z. B. kein `steer`) zusätzlich: eine minimale und eine vollständige Variante gegeneinander testen, damit fehlende Fähigkeiten nachweisbar im Capability-Status landen statt nur in der Methodensignatur zu fehlen.

## Schritte zum Anschluss eines neuen CLI

1. Neues Verzeichnis `src/lib/agents/providers/<name>/` mit `client.ts`, das `AgentProviderAdapter` implementiert (`driver: driverKind("<name>")`).
2. Transportwahl: Prozess mit stdio-JSONL über `openAgentTransport` (siehe `providers/cursor/client.ts` für Single-Turn-Prozesse, `providers/opencode/client.ts` für langlebige Sessions) oder, für Tests/Prototypen, ein prozessloser Adapter wie `FakeProviderAdapter`.
3. Eventnormalisierung auf `AgentRuntimeEvent` inklusive fortlaufender `sequence` pro Thread.
4. Capability-Matrix definieren und in `provider-registry.ts` (`AGENT_PROVIDERS`) sowie ggf. `provider-meta.ts` eintragen — additiv, keine bestehenden Einträge verändern.
5. Persistenz: Threads/`NativeSessionRef` laufen über `session-manager.ts` (`registerSession`/`sessionFor`), keine eigene Persistenzschicht im Treiber.
6. Cleanup: `stop()` räumt Prozesse/Handles auf und ist idempotent (auch für unbekannte Threads).
7. Test-Fixtures: JSONL- oder In-Memory-Fixtures unter `__tests__/`, kein Netzwerk- oder echter Prozesszugriff in Tests.
8. Konformitätstests ergänzen (siehe oben) und `npx vitest run` grün halten.

## Versionspolitik und unbekannte Treiber

`DriverKind` ist ein offener String (kein geschlossenes Enum) — neue Treiber sind additiv, ohne bestehende Typen zu brechen. `session-manager.dispatch` wirft für einen `command.driver`, für den kein Adapter registriert ist (`No adapter registered for driver ...`); es gibt keinen stillen Fallback auf einen Default-Treiber. Ein Treiber mit unvollständiger Capability-Matrix ist trotzdem gültig, solange jede fehlende Fähigkeit einen `reason` trägt — es gibt keine Mindestabdeckung, nur Ehrlichkeit über das, was fehlt.

Referenz-Plugin ohne Remote-Code-Laden: `FakeProviderAdapter` wird ausschließlich in Tests instanziiert (`fake-provider-conformance.test.ts`) und ist nicht Teil der Produktions-Registry (`provider-registry.ts`). Neue Treiber laden keinen Code zur Laufzeit nach; sie sind normale, zur Build-Zeit gebundene TypeScript-Module.
