/** Local, searchable guidance. Opening a guide never executes a Git command. */
export type WorkflowCategory = 'daily' | 'history' | 'team' | 'recovery' | 'advanced';
export type WorkflowTarget = 'commit' | 'history' | 'stash' | 'pr' | 'worktrees' | 'submodules' | 'hooks' | 'tools' | 'ci' | 'reflog' | 'commands' | 'settings' | 'tour';
export type WorkflowGuide = {
  id: string;
  category: WorkflowCategory;
  title: string;
  summary: string;
  steps: string[];
  caution: string;
  target: WorkflowTarget;
  keywords: string;
  reference: string;
};

export type GuideCopy = Pick<WorkflowGuide, 'title' | 'summary' | 'steps' | 'caution'>;
type GuideDefinition = Omit<WorkflowGuide, keyof GuideCopy> & { en: GuideCopy; de: GuideCopy };

const definitions: GuideDefinition[] = [
  {
    id: 'submodule-work', category: 'advanced', target: 'submodules', keywords: 'submodule nested gitlink dependency initialize update sync pinned recursive untermodul abhängigkeit verschachtelt', reference: 'git-submodule',
    en: { title: 'Update a submodule deliberately', summary: 'Understand the recorded dependency version and the checkout inside it.', steps: ['Open Submodules and inspect the recorded commit, current checkout and local changes.', 'Initialize an uninitialized submodule, or update its checkout to the version recorded by the parent repository.', 'If developing the dependency, open its repository, create a branch and commit its changes there.', 'Make the submodule commit available to your team before staging and committing the updated gitlink in the parent repository.'], caution: 'The parent stores a commit ID, not the submodule’s files. A detached checkout is normal after update. Update does not mean following the latest remote branch; preserve local changes before switching versions.' },
    de: { title: 'Ein Submodul bewusst aktualisieren', summary: 'Verstehe die gespeicherte Abhängigkeitsversion und die Arbeitskopie darin.', steps: ['Öffne Submodule und prüfe den gespeicherten Commit, den aktuellen Checkout und lokale Änderungen.', 'Initialisiere ein neues Submodul oder aktualisiere seinen Checkout auf die im übergeordneten Repository gespeicherte Version.', 'Öffne zum Entwickeln der Abhängigkeit ihr Repository, erstelle einen Branch und committe ihre Änderungen dort.', 'Stelle dem Team den Submodul-Commit bereit, bevor du den aktualisierten Gitlink im übergeordneten Repository stagst und committest.'], caution: 'Das übergeordnete Repository speichert eine Commit-ID, nicht die Submodul-Dateien. Ein losgelöster Checkout nach Update ist normal. Update folgt nicht automatisch dem neuesten Remote-Branch; sichere lokale Änderungen vor dem Versionswechsel.' },
  },
  {
    id: 'large-files', category: 'advanced', target: 'tools', keywords: 'lfs large files binary pointer attributes track download missing image groẞ groß dateien binär', reference: 'gitattributes',
    en: { title: 'Manage large files and LFS pointers', summary: 'Distinguish stored pointers from the binary content they refer to.', steps: ['Open Tools and inspect Git LFS availability, tracking patterns and listed files.', 'If LFS is unavailable, install Git LFS using its official installer and refresh the status.', 'Add the intended tracking pattern before staging new large files. Review the resulting .gitattributes change.', 'Use Pull LFS content to download missing objects, inspect their previews and commit the intended files and attributes together.'], caution: 'A pointer is metadata, not the binary content. Adding a tracking pattern does not migrate existing history. Removing a pattern does not remove old LFS objects or shrink the repository.' },
    de: { title: 'Große Dateien und LFS-Pointer verwalten', summary: 'Unterscheide gespeicherte Pointer von den zugehörigen Binärinhalten.', steps: ['Öffne Tools und prüfe Git-LFS-Verfügbarkeit, Tracking-Muster und aufgelistete Dateien.', 'Installiere Git LFS bei fehlender Verfügbarkeit mit dem offiziellen Installer und aktualisiere den Status.', 'Füge das passende Tracking-Muster vor dem Stagen neuer großer Dateien hinzu. Prüfe die Änderung an .gitattributes.', 'Lade fehlende Objekte mit LFS-Inhalte laden, prüfe ihre Vorschauen und committe gewünschte Dateien und Attribute gemeinsam.'], caution: 'Ein Pointer enthält Metadaten, nicht den Binärinhalt. Ein Tracking-Muster migriert keine bestehende Historie. Das Entfernen eines Musters löscht keine alten LFS-Objekte und verkleinert das Repository nicht.' },
  },
  {
    id: 'check-hooks', category: 'advanced', target: 'hooks', keywords: 'hook pre-commit commit-msg pre-push script validation failed exit code haken prüfung skript', reference: 'githooks',
    en: { title: 'Understand and debug Git hooks', summary: 'Find the checks Git runs before or after an operation.', steps: ['Open Hooks and inspect which scripts exist and are enabled.', 'Read the relevant hook and its expected arguments before running or editing it.', 'Use the available execution output to diagnose a failed check; inspect the project command or file it reports.', 'Correct the underlying issue and retry the original Git operation. Review hook edits before enabling them.'], caution: 'Hooks execute programs with your user permissions. A nonzero result can stop an operation; a post-commit hook cannot undo a completed commit. Hook files are usually local unless the project provides an installation workflow.' },
    de: { title: 'Git-Hooks verstehen und Fehler finden', summary: 'Finde die Prüfungen, die Git vor oder nach einer Operation ausführt.', steps: ['Öffne Hooks und prüfe, welche Skripte vorhanden und aktiviert sind.', 'Lies den betreffenden Hook und seine erwarteten Argumente vor dem Ausführen oder Bearbeiten.', 'Nutze die Ausführungsausgabe zur Fehlersuche und prüfe den gemeldeten Projektbefehl oder die Datei.', 'Behebe die Ursache und wiederhole die ursprüngliche Git-Operation. Prüfe Hook-Änderungen vor dem Aktivieren.'], caution: 'Hooks führen Programme mit deinen Benutzerrechten aus. Ein Fehlercode kann die Operation stoppen; ein Post-Commit-Hook nimmt einen fertigen Commit nicht zurück. Hook-Dateien sind meist lokal, sofern das Projekt keinen Installationsablauf bereitstellt.' },
  },
  {
    id: 'compare-branches', category: 'history', target: 'history', keywords: 'compare direct merge-base two three dot diff branch tag comparison vergleichen gemeinsam basis', reference: 'git-diff',
    en: { title: 'Compare branches, tags or commits', summary: 'See the exact file changes between two versions or the work added since a shared base.', steps: ['Select exactly two commits in history and choose Compare, or search for Compare in the command palette.', 'Choose the base and head references. A direct comparison shows differences between their snapshots; a common-ancestor comparison shows changes from their shared base to head.', 'Inspect the file summary, filter by status or path, and review each diff. Renamed files show their previous names.', 'Mark files reviewed, hide reviewed files and move through the remaining changes. Refresh the comparison when a branch moves.'], caution: 'The comparison pins file diffs to the resolved commit hashes. It does not merge changes or include uncommitted edits. Truncation is shown when a patch or file list exceeds the display limit.' },
    de: { title: 'Branches, Tags oder Commits vergleichen', summary: 'Sieh die Dateiänderungen zwischen zwei Versionen oder die Arbeit seit einer gemeinsamen Basis.', steps: ['Wähle genau zwei Commits in der Historie und Vergleichen, oder suche in der Befehlspalette nach Vergleichen.', 'Wähle Basis und Ziel. Direkt zeigt Unterschiede ihrer Snapshots; Gemeinsame Basis zeigt Änderungen von ihrem gemeinsamen Vorfahren bis zum Ziel.', 'Prüfe die Dateiübersicht, filtere nach Status oder Pfad und lies die Diffs. Umbenannte Dateien zeigen den früheren Namen.', 'Markiere Dateien als geprüft, blende sie aus und gehe die verbleibenden Änderungen durch. Aktualisiere den Vergleich, wenn sich ein Branch bewegt.'], caution: 'Datei-Diffs sind an die aufgelösten Commit-Hashes gebunden. Der Vergleich führt keinen Merge aus und enthält keine uncommitteten Änderungen. Kürzungen großer Patches oder Dateilisten werden angezeigt.' },
  },
  {
    id: 'first-commit', category: 'daily', target: 'commit', keywords: 'stage index hunk partial staging start first commit erster commit zeilen stagen', reference: 'git-add',
    en: { title: 'Create a focused commit', summary: 'Review the exact changes that will become the next snapshot.', steps: ['Open the working copy and select a changed file to inspect its diff.', 'Stage only the files, hunks or lines that belong to one change. Unstaged changes stay on disk.', 'Write a subject describing the result. Add the reason and test evidence in the body when helpful.', 'Review the staged diff once more, then commit. The history shows the resulting snapshot.'], caution: 'A commit contains the staged version of each file. Later edits in the working copy are not automatically included.' },
    de: { title: 'Einen fokussierten Commit erstellen', summary: 'Prüfe genau die Änderungen, die zum nächsten Snapshot werden.', steps: ['Öffne die Arbeitskopie und wähle eine geänderte Datei für den Diff.', 'Stage nur die Dateien, Hunks oder Zeilen, die zu einer Änderung gehören. Ungestagte Änderungen bleiben auf der Festplatte.', 'Beschreibe das Ergebnis im Betreff. Ergänze bei Bedarf den Grund und die Prüfung im Nachrichtentext.', 'Prüfe den gestagten Diff erneut und erstelle den Commit. Die Historie zeigt den neuen Snapshot.'], caution: 'Ein Commit enthält die gestagte Version jeder Datei. Spätere Änderungen in der Arbeitskopie werden nicht automatisch übernommen.' },
  },
  {
    id: 'split-changes', category: 'daily', target: 'commit', keywords: 'split changes logical atomic ai separate aufteilen teilen commits', reference: 'git-add',
    en: { title: 'Split a large change into logical commits', summary: 'Separate unrelated work without losing the remaining edits.', steps: ['Review all changed files and identify independent changes.', 'Stage the hunks or lines for the first change, or use the AI split proposal and inspect every group.', 'Commit that group with a focused message.', 'Repeat for the remaining changes. Review and test the final working copy.'], caution: 'AI groups are proposals. Check dependencies between groups so each commit remains understandable and usable.' },
    de: { title: 'Große Änderungen in logische Commits aufteilen', summary: 'Trenne unabhängige Arbeit, ohne die übrigen Änderungen zu verlieren.', steps: ['Prüfe alle geänderten Dateien und erkenne unabhängige Änderungen.', 'Stage die Hunks oder Zeilen für die erste Änderung, oder prüfe jede Gruppe des KI-Vorschlags zum Aufteilen.', 'Committe diese Gruppe mit einer passenden Nachricht.', 'Wiederhole das für die übrigen Änderungen. Prüfe und teste die gesamte Arbeitskopie.'], caution: 'KI-Gruppen sind Vorschläge. Prüfe Abhängigkeiten, damit jeder Commit verständlich und nutzbar bleibt.' },
  },
  {
    id: 'sync-branch', category: 'team', target: 'history', keywords: 'fetch pull push behind ahead upstream diverged sync non-fast-forward rejected synchronisieren abgelehnt', reference: 'git-pull',
    en: { title: 'Synchronize a branch with its remote', summary: 'Understand incoming and outgoing commits before updating.', steps: ['Fetch to refresh remote-tracking branches without changing your working files.', 'Inspect the incoming and outgoing commits in history.', 'If there are incoming commits, save local edits and pull using the appropriate merge or rebase strategy.', 'Resolve any conflicts, run the relevant checks, then push your outgoing commits.'], caution: 'Ahead and behind counts reflect the last fetch. If both are nonzero, the histories have diverged; pushing alone will usually be rejected.' },
    de: { title: 'Einen Branch mit dem Remote synchronisieren', summary: 'Verstehe eingehende und ausgehende Commits vor dem Aktualisieren.', steps: ['Fetche, um Remote-Tracking-Branches zu aktualisieren, ohne Arbeitsdateien zu ändern.', 'Prüfe eingehende und ausgehende Commits in der Historie.', 'Sichere lokale Änderungen und pulle mit der passenden Merge- oder Rebase-Strategie, wenn Commits fehlen.', 'Löse Konflikte, führe die nötigen Prüfungen aus und pushe anschließend deine Commits.'], caution: 'Ahead- und Behind-Zahlen beziehen sich auf den letzten Fetch. Sind beide größer als null, sind die Historien auseinander gelaufen; ein Push allein wird meist abgelehnt.' },
  },
  {
    id: 'stash-work', category: 'daily', target: 'stash', keywords: 'stash switch branch untracked save temporarily stash pop apply zwischenlagern sichern wechseln', reference: 'git-stash',
    en: { title: 'Set work aside and return to it', summary: 'Use a stash when you need a temporary clean working copy.', steps: ['Open Stashes and create a stash with a descriptive name.', 'Include untracked files if your new files belong to this work.', 'Switch branches or perform the required operation.', 'Apply the stash to keep its saved copy, or pop it to remove the saved copy after a successful application. Inspect and resolve any conflicts.'], caution: 'Ignored files are not included by the usual untracked-files option. A conflicting pop keeps the stash; inspect the working copy before applying it again.' },
    de: { title: 'Arbeit zwischenlagern und wieder aufnehmen', summary: 'Nutze einen Stash, wenn du vorübergehend eine saubere Arbeitskopie brauchst.', steps: ['Öffne Stashes und erstelle einen Stash mit einem aussagekräftigen Namen.', 'Nimm ungetrackte Dateien auf, wenn neue Dateien zu dieser Arbeit gehören.', 'Wechsle den Branch oder führe die nötige Operation aus.', 'Apply behält die Sicherung. Pop entfernt sie nach erfolgreicher Anwendung. Prüfe und löse mögliche Konflikte.'], caution: 'Ignorierte Dateien werden durch die übliche Option für ungetrackte Dateien nicht aufgenommen. Bei Konflikten behält Pop den Stash; prüfe vor erneutem Anwenden die Arbeitskopie.' },
  },
  {
    id: 'resolve-conflicts', category: 'recovery', target: 'commit', keywords: 'conflict merge rebase cherry-pick ours theirs base resolve continue abort konflikt lösen fortsetzen', reference: 'git-merge',
    en: { title: 'Resolve a conflict and continue', summary: 'Combine the intended changes rather than choosing a side blindly.', steps: ['Open the working copy and select a conflicted file to open the merge editor.', 'Compare base, ours and theirs. Edit the result so it contains the intended behavior.', 'Save and mark the file resolved. Repeat for every conflicted file and inspect the staged result.', 'Use Continue on the operation banner. Use Abort if you want to abandon the operation, after preserving any resolution work you need.'], caution: 'During a rebase, ours is the branch you are rebasing onto and theirs is the commit being replayed. These labels do not always mean your edits versus someone else’s.' },
    de: { title: 'Konflikte lösen und fortsetzen', summary: 'Kombiniere die gewünschten Änderungen, statt ungeprüft eine Seite zu wählen.', steps: ['Öffne die Arbeitskopie und wähle eine Konfliktdatei für den Merge-Editor.', 'Vergleiche Base, Ours und Theirs. Bearbeite das Ergebnis so, dass es das gewünschte Verhalten enthält.', 'Speichere und markiere die Datei als gelöst. Wiederhole das für alle Konflikte und prüfe das gestagte Ergebnis.', 'Nutze Fortsetzen im Operationsbanner. Abbrechen verwirft die Operation; sichere vorher Lösungsarbeit, die du behalten möchtest.'], caution: 'Beim Rebase ist Ours der Branch, auf den du rebasierst, und Theirs der gerade wiederholte Commit. Die Bezeichnungen bedeuten nicht immer deine Änderungen gegenüber fremden Änderungen.' },
  },
  {
    id: 'recover-history', category: 'recovery', target: 'reflog', keywords: 'undo lost commit reflog reset recover restore deleted branch recovery verloren wiederherstellen rückgängig', reference: 'git-reflog',
    en: { title: 'Find a lost commit or branch tip', summary: 'Inspect previous local positions of HEAD before changing history.', steps: ['Open the reflog and locate the entry before the mistaken checkout, reset or rebase.', 'Inspect the commit hash and its changes to confirm it is the version you need.', 'Choose Create rescue branch on that reflog entry to preserve the commit without switching branches or changing your files.', 'If moving the current branch is appropriate, review the reset mode and local edits before confirming.'], caution: 'Reflogs are local and their entries can expire. They cannot recover uncommitted edits that were never stored in a commit or stash.' },
    de: { title: 'Verlorene Commits oder Branch-Spitzen finden', summary: 'Prüfe frühere lokale HEAD-Positionen, bevor du die Historie änderst.', steps: ['Öffne das Reflog und finde den Eintrag vor dem versehentlichen Checkout, Reset oder Rebase.', 'Prüfe Commit-Hash und Änderungen, um die benötigte Version zu erkennen.', 'Wähle Rettungsbranch erstellen am Reflog-Eintrag, um den Commit ohne Branch-Wechsel oder Änderung deiner Dateien zu erhalten.', 'Wenn du den aktuellen Branch verschieben möchtest, prüfe Reset-Modus und lokale Änderungen vor der Bestätigung.'], caution: 'Reflogs sind lokal und Einträge können ablaufen. Sie stellen keine uncommitteten Änderungen wieder her, die nie in einem Commit oder Stash gespeichert wurden.' },
  },
  {
    id: 'undo-shared-commit', category: 'recovery', target: 'history', keywords: 'revert shared pushed undo public commit zurücknehmen veröffentlicht rückgängig', reference: 'git-revert',
    en: { title: 'Undo a commit that others already use', summary: 'Create an inverse commit while keeping shared history intact.', steps: ['Find and inspect the commit in history.', 'Choose Revert from its context menu. For a merge commit, select the mainline parent deliberately.', 'Resolve any conflicts and continue the revert when requested.', 'Inspect and test the new inverse commit, then push it for the team.'], caution: 'Reverting a merge affects what later merges will bring back. Read the merge-revert explanation before reverting a shared merge.' },
    de: { title: 'Einen bereits geteilten Commit zurücknehmen', summary: 'Erstelle einen Gegen-Commit und erhalte die gemeinsame Historie.', steps: ['Finde und prüfe den Commit in der Historie.', 'Wähle Revert im Kontextmenü. Wähle bei einem Merge-Commit bewusst den Mainline-Elternteil.', 'Löse Konflikte und setze den Revert fort, falls nötig.', 'Prüfe und teste den neuen Gegen-Commit und pushe ihn für das Team.'], caution: 'Ein Merge-Revert beeinflusst, was spätere Merges zurückbringen. Lies die Erklärung dazu, bevor du einen geteilten Merge zurücknimmst.' },
  },
  {
    id: 'clean-history', category: 'history', target: 'history', keywords: 'interactive rebase squash fixup reword reorder clean history aufräumen umordnen', reference: 'git-rebase',
    en: { title: 'Clean up a branch before review', summary: 'Reorder, combine and reword unpublished commits visually.', steps: ['Save local edits and identify the base immediately before the commits you want to change.', 'Open Interactive rebase and inspect the commits to be replayed.', 'Reorder commits and choose pick, reword, squash, fixup, edit or drop. Review the final plan.', 'Start the rebase, resolve conflicts as needed and compare the result with the intended change.'], caution: 'Rebase changes commit hashes. Coordinate before rewriting commits already used by others; force-with-lease checks the expected remote state but does not replace that coordination.' },
    de: { title: 'Einen Branch vor dem Review aufräumen', summary: 'Ordne, kombiniere und benenne unveröffentlichte Commits visuell um.', steps: ['Sichere lokale Änderungen und bestimme die Basis direkt vor den zu ändernden Commits.', 'Öffne den interaktiven Rebase und prüfe die zu wiederholenden Commits.', 'Ordne Commits um und wähle Pick, Reword, Squash, Fixup, Edit oder Drop. Prüfe den fertigen Plan.', 'Starte den Rebase, löse Konflikte und vergleiche das Ergebnis mit der gewünschten Änderung.'], caution: 'Rebase ändert Commit-Hashes. Stimme das Umschreiben bereits geteilter Commits ab; Force-with-lease prüft den erwarteten Remote-Zustand, ersetzt diese Abstimmung aber nicht.' },
  },
  {
    id: 'find-change', category: 'history', target: 'history', keywords: 'search author date path filters log find bug history suchen autor datum pfad filter', reference: 'git-log',
    en: { title: 'Find when and why a change happened', summary: 'Narrow history by message, author, dates, branch and file path.', steps: ['Open history and enter a message fragment, commit hash or author.', 'Use advanced filters for branch, author, date range or path when the result is too broad.', 'Inspect each matching commit’s message and changed files; load more results when needed.', 'Use blame for a specific line, or save a reusable filter preset for a recurring investigation.'], caution: 'The loaded history is a window into the repository. Search and advanced filters query Git; do not assume an unloaded commit is missing.' },
    de: { title: 'Finden, wann und warum etwas geändert wurde', summary: 'Grenze die Historie nach Nachricht, Autor, Datum, Branch und Dateipfad ein.', steps: ['Öffne die Historie und suche nach Nachrichtenteil, Commit-Hash oder Autor.', 'Nutze erweiterte Filter für Branch, Autor, Zeitraum oder Pfad, wenn die Ergebnisse zu breit sind.', 'Prüfe Nachricht und geänderte Dateien jedes Treffers und lade bei Bedarf weitere Ergebnisse.', 'Nutze Blame für eine bestimmte Zeile oder speichere einen Filter für wiederkehrende Recherchen.'], caution: 'Die geladene Historie ist ein Ausschnitt des Repositorys. Suche und erweiterte Filter fragen Git ab; ein ungeladener Commit ist nicht automatisch verschwunden.' },
  },
  {
    id: 'parallel-work', category: 'advanced', target: 'worktrees', keywords: 'worktree parallel agents isolated branch multiple tasks workspaces parallel arbeiten agenten', reference: 'git-worktree',
    en: { title: 'Work on several branches at once', summary: 'Give each task or agent its own working directory.', steps: ['Open Worktrees and add a worktree for the task’s branch.', 'Choose a separate directory and open that worktree as a repository.', 'Develop and test independently. Agent sessions can use their own worktrees too.', 'Review and integrate the commits before removing the worktree and any unneeded branch.'], caution: 'Worktrees share repository objects and refs. Git normally prevents checking out the same branch in multiple worktrees; removing a worktree with local edits requires careful review.' },
    de: { title: 'An mehreren Branches gleichzeitig arbeiten', summary: 'Gib jeder Aufgabe oder jedem Agenten ein eigenes Arbeitsverzeichnis.', steps: ['Öffne Worktrees und füge einen Worktree für den Aufgaben-Branch hinzu.', 'Wähle ein separates Verzeichnis und öffne den Worktree als Repository.', 'Entwickle und teste unabhängig. Auch Agent-Sitzungen können eigene Worktrees verwenden.', 'Prüfe und integriere die Commits, bevor du Worktree und nicht mehr benötigten Branch entfernst.'], caution: 'Worktrees teilen Repository-Objekte und Refs. Git verhindert normalerweise denselben ausgecheckten Branch in mehreren Worktrees; prüfe lokale Änderungen vor dem Entfernen.' },
  },
  {
    id: 'review-pr', category: 'team', target: 'pr', keywords: 'pull request merge request review draft suggestions comments pr mr prüfen', reference: 'git-diff',
    en: { title: 'Review a pull request thoroughly', summary: 'Combine code review, discussion and checks in one workflow.', steps: ['Open Pull requests and select the change to review.', 'Read the description and inspect the files, diff and check results.', 'Leave inline comments, collect review drafts and inspect suggested changes before applying them.', 'Submit the review. Merge only after the required reviews and checks are satisfied.'], caution: 'Available actions depend on the Git provider and your permissions. An applied suggestion still needs inspection and the appropriate commit or review action.' },
    de: { title: 'Einen Pull Request gründlich prüfen', summary: 'Verbinde Code-Review, Diskussion und Prüfungen in einem Ablauf.', steps: ['Öffne Pull Requests und wähle die Änderung für das Review.', 'Lies die Beschreibung und prüfe Dateien, Diffs und Check-Ergebnisse.', 'Schreibe Inline-Kommentare, sammle Review-Entwürfe und prüfe Änderungsvorschläge vor dem Anwenden.', 'Sende das Review. Merge erst nach den nötigen Reviews und bestandenen Checks.'], caution: 'Verfügbare Aktionen hängen vom Git-Provider und deinen Rechten ab. Angewendete Vorschläge müssen weiter geprüft und passend committet oder bewertet werden.' },
  },
  {
    id: 'failed-checks', category: 'team', target: 'ci', keywords: 'ci checks pipeline failed build workflow logs tests broken rot fehlgeschlagen', reference: 'git-show',
    en: { title: 'Investigate a failing check', summary: 'Connect a failed pipeline to the commit and failing step.', steps: ['Open CI and select the run for the relevant branch and commit.', 'Inspect jobs, steps, annotations and available output to identify the first useful failure.', 'Compare the triggering commit and reproduce the failing command locally when possible.', 'Commit a fix, or rerun a transient failure if the provider supports it. Verify the replacement run.'], caution: 'A rerun does not change the code. Distinguish infrastructure or network failures from reproducible test failures.' },
    de: { title: 'Einen fehlgeschlagenen Check untersuchen', summary: 'Verbinde den roten Pipeline-Lauf mit Commit und fehlgeschlagenem Schritt.', steps: ['Öffne CI und wähle den Lauf für den betreffenden Branch und Commit.', 'Prüfe Jobs, Schritte, Annotationen und Ausgaben auf den ersten hilfreichen Fehler.', 'Vergleiche den auslösenden Commit und reproduziere den fehlgeschlagenen Befehl möglichst lokal.', 'Committe eine Korrektur oder starte einen vorübergehenden Fehler erneut, falls unterstützt. Prüfe den neuen Lauf.'], caution: 'Ein erneuter Lauf ändert keinen Code. Unterscheide Infrastruktur- oder Netzwerkfehler von reproduzierbaren Testfehlern.' },
  },
  {
    id: 'auth-troubleshooting', category: 'recovery', target: 'settings', keywords: 'authentication credentials permission denied ssh https token account 401 403 zugang berechtigung anmeldung', reference: 'gitcredentials',
    en: { title: 'Fix authentication or permission problems', summary: 'Check the remote URL, transport and account before retrying.', steps: ['Inspect the remote URL and identify whether the repository uses HTTPS or SSH.', 'For HTTPS, check the matching host/account credentials in settings. For SSH, verify the key and agent used by Git.', 'Check repository access and token permissions with your provider, especially for private repos or enterprise hosts.', 'Retry fetch and inspect the command log if the error remains. Copy only the details needed for diagnosis.'], caution: 'Changing an HTTPS token does not fix an SSH remote. Git transport credentials and API credentials for pull requests can differ.' },
    de: { title: 'Anmelde- und Berechtigungsprobleme beheben', summary: 'Prüfe Remote-URL, Transport und Konto vor dem erneuten Versuch.', steps: ['Prüfe die Remote-URL und erkenne, ob das Repository HTTPS oder SSH nutzt.', 'Prüfe für HTTPS das passende Host-Konto in den Einstellungen. Prüfe für SSH den von Git verwendeten Schlüssel und Agenten.', 'Prüfe Repository-Zugriff und Token-Rechte beim Provider, besonders für private Repositories und Enterprise-Hosts.', 'Versuche Fetch erneut und prüfe bei verbleibenden Fehlern das Befehlsprotokoll. Kopiere nur die nötigen Diagnosedetails.'], caution: 'Ein neuer HTTPS-Token behebt kein SSH-Remote. Git-Zugangsdaten und API-Zugang für Pull Requests können unterschiedlich sein.' },
  },
  {
    id: 'detached-head', category: 'recovery', target: 'history', keywords: 'detached head checkout commit no branch lost retain losgelöst branch erstellen', reference: 'git-checkout',
    en: { title: 'Keep work made on a detached HEAD', summary: 'Attach your commits to a branch before switching away.', steps: ['Inspect the current commit in history and confirm which commits you want to keep.', 'Create a new branch at the current commit using the branch action.', 'Check out that branch and confirm your commits remain in its history.', 'Integrate or push the branch as usual. If you already switched away, locate the commit in the reflog.'], caution: 'Detached HEAD means the current checkout points directly to a commit. New commits need a branch or another ref to keep them easily reachable.' },
    de: { title: 'Arbeit auf einem losgelösten HEAD behalten', summary: 'Verbinde deine Commits mit einem Branch, bevor du wegwechselst.', steps: ['Prüfe den aktuellen Commit in der Historie und die Commits, die du behalten möchtest.', 'Erstelle über die Branch-Aktion einen neuen Branch am aktuellen Commit.', 'Checke diesen Branch aus und prüfe, ob deine Commits in seiner Historie bleiben.', 'Integriere oder pushe den Branch wie gewohnt. Wenn du bereits gewechselt hast, suche den Commit im Reflog.'], caution: 'Ein losgelöster HEAD zeigt direkt auf einen Commit. Neue Commits brauchen einen Branch oder eine andere Ref, damit sie leicht erreichbar bleiben.' },
  },
];

function localizedGuideCopy(copies: unknown, id: string, fallback: GuideCopy): GuideCopy {
  if (!copies || typeof copies !== 'object' || Array.isArray(copies)) return fallback;
  const copy = (copies as Record<string, unknown>)[id];
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return fallback;
  const value = copy as Partial<GuideCopy>;
  if (![value.title, value.summary, value.caution].every(field => typeof field === 'string' && field.trim()) || !Array.isArray(value.steps) || value.steps.length !== fallback.steps.length || !value.steps.every(step => typeof step === 'string' && step.trim())) return fallback;
  return { title: value.title!, summary: value.summary!, caution: value.caution!, steps: [...value.steps] };
}

/** Copy comes from the already-loaded locale bundle; metadata and destinations stay fixed. */
export function getWorkflowGuides(language: string, copies?: unknown): WorkflowGuide[] {
  const locale = language.toLowerCase().split(/[-_]/)[0] === 'de' ? 'de' : 'en';
  return definitions.map(({ en, de, ...definition }) => ({ ...definition, ...localizedGuideCopy(copies, definition.id, locale === 'de' ? de : en), reference: `https://git-scm.com/docs/${definition.reference}` }));
}

export function normalizeHelpSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function searchWorkflowGuides(guides: WorkflowGuide[], query: string, category?: WorkflowCategory): WorkflowGuide[] {
  const normalized = normalizeHelpSearch(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return guides.filter(guide => !category || guide.category === category).map((guide, index) => {
    const title = normalizeHelpSearch(guide.title);
    const summary = normalizeHelpSearch(guide.summary);
    const keywords = normalizeHelpSearch(guide.keywords);
    const content = normalizeHelpSearch(`${guide.steps.join(' ')} ${guide.caution}`);
    const matches = tokens.every(token => `${title} ${summary} ${keywords} ${content}`.includes(token));
    const score = (normalized && title.includes(normalized) ? 30 : 0) + tokens.reduce((sum, token) => sum + (title.includes(token) ? 8 : summary.includes(token) ? 4 : keywords.includes(token) ? 3 : 1), 0);
    return { guide, index, matches, score };
  }).filter(result => result.matches).sort((a, b) => b.score - a.score || a.index - b.index).map(result => result.guide);
}

export type WorkflowContext = {
  hasRepo: boolean;
  statusKnown: boolean;
  staged: number;
  changed: number;
  conflicts: number;
  detached: boolean;
  ahead?: number;
  behind?: number;
  operation?: 'rebase' | 'merge' | 'cherry-pick' | null;
};

export type WorkflowRecommendation = { guideId: string; reason: 'start' | 'conflicts' | 'operation' | 'detached' | 'diverged' | 'behind' | 'staged' | 'changed' | 'ahead' | 'clean' | 'unknown'; severity: 'attention' | 'info' };

export function recommendWorkflow(context: WorkflowContext): WorkflowRecommendation {
  if (!context.hasRepo) return { guideId: 'first-commit', reason: 'start', severity: 'info' };
  if (context.conflicts > 0) return { guideId: 'resolve-conflicts', reason: 'conflicts', severity: 'attention' };
  if (context.operation) return { guideId: 'resolve-conflicts', reason: 'operation', severity: 'attention' };
  if (context.detached) return { guideId: 'detached-head', reason: 'detached', severity: 'attention' };
  if ((context.ahead ?? 0) > 0 && (context.behind ?? 0) > 0) return { guideId: 'sync-branch', reason: 'diverged', severity: 'attention' };
  if ((context.behind ?? 0) > 0) return { guideId: 'sync-branch', reason: 'behind', severity: 'info' };
  if (!context.statusKnown) return { guideId: 'first-commit', reason: 'unknown', severity: 'info' };
  if (context.staged > 0) return { guideId: 'first-commit', reason: 'staged', severity: 'info' };
  if (context.changed > 0) return { guideId: 'split-changes', reason: 'changed', severity: 'info' };
  if ((context.ahead ?? 0) > 0) return { guideId: 'sync-branch', reason: 'ahead', severity: 'info' };
  return { guideId: 'find-change', reason: 'clean', severity: 'info' };
}

export function isConflictedStatus(index: string, worktree: string): boolean {
  return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(index + worktree);
}
