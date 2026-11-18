#!/usr/bin/env python3
"""Launch only the opt-in macOS WKWebView acceptance fixture."""

import argparse
import hashlib
import json
import os
import selectors
import shutil
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / "src-tauri/target/debug/examples/native_submodule_acceptance"
SANDBOX = "/usr/bin/sandbox-exec"


def git(repo, env, *args):
    return subprocess.check_output(
        ["/usr/bin/git", "-C", repo, *args], env=env, text=True, stderr=subprocess.PIPE
    ).strip()


def submodule_fixture(root, env):
    repos = root / "repos"
    repos.mkdir()
    source, parent = repos / "source", repos / "parent"

    def commit(repo, file, content):
        (repo / file).write_text(content + "\n")
        git(repo, env, "add", "--", file)
        git(repo, env, "commit", "--quiet", "-m", content)
        return git(repo, env, "rev-parse", "HEAD")

    for repo in (source, parent):
        repo.mkdir()
        git(repo, env, "init", "--quiet", "--initial-branch=main")
    commit(parent, "app.txt", "native-parent")
    before = commit(source, "lib.txt", "native-original")
    for name in ("live", "uninitialized", "unavailable", "dirty"):
        git(parent, env, "-c", "protocol.file.allow=always", "submodule", "add", "--name", name,
            "--", source.as_uri(), f"vendor/{name}")
    git(parent, env, "commit", "--quiet", "-m", "Register synthetic submodules")
    live = parent / "vendor/live"
    index = commit(live, "lib.txt", "native-index")
    git(parent, env, "add", "--", "vendor/live")
    checkout = commit(live, "lib.txt", "native-checkout")
    missing = commit(source, "lib.txt", "native-only-in-source")
    git(parent, env, "update-index", "--cacheinfo", f"160000,{index},vendor/uninitialized")
    git(parent, env, "update-index", "--cacheinfo", f"160000,{missing},vendor/unavailable")
    # Remove only the known synthetic checkout's gitfile; keep its directory
    # and the staged link, so both pins remain available from the parent diff.
    (parent / "vendor/uninitialized/.git").unlink()
    (parent / "vendor/dirty/lib.txt").write_text("native-dirty-only\n")
    git(live, env, "config", "diff.external", str(root / "forbidden-diff-helper"))
    git(live, env, "config", "diff.acceptance.textconv", str(root / "forbidden-textconv-helper"))
    (live / ".gitattributes").write_text("lib.txt diff=acceptance\n")
    return {"parent": str(parent), "child": str(live), "outside": str(source),
            "before": before, "index": index, "checkout": checkout}


def staging_fixture(root, env):
    repo = root / "repos/staging"
    repo.mkdir(parents=True)
    git(repo, env, "init", "--quiet", "--initial-branch=main")
    git(repo, env, "config", "core.fileMode", "true")
    mode, text = repo / "mode.sh", repo / "text.txt"
    mode.write_text("#!/bin/sh\necho native-mode-fixture\n")
    mode.chmod(0o644)
    original = "".join(f"local fixture line {line}\n" for line in range(1, 31))
    text.write_text(original)
    git(repo, env, "add", "--", mode.name, text.name)
    git(repo, env, "commit", "--quiet", "-m", "Initial staging fixture")
    mode.chmod(0o755)
    text.write_text(original.replace("local fixture line 2\n", "native-first-edit\n")
                    .replace("local fixture line 29\n", "native-second-edit\n"))
    sentinel = root / "protected"
    sentinel.touch()
    return {"kind": "staging", "parent": str(repo), "outside": str(repo.parent)}


def worktree_fixture(root, env):
    main, linked, other = (root / "repos" / name for name in ("catalog-main", "catalog-linked", "catalog-other"))
    for repo in (main, other):
        repo.mkdir(parents=True)
        git(repo, env, "init", "--quiet", "--initial-branch=main")
        (repo / "fixture.txt").write_text("synthetic fixture\n")
        git(repo, env, "add", "--", "fixture.txt")
        git(repo, env, "commit", "--quiet", "-m", "Catalog baseline")
    git(main, env, "worktree", "add", "--detach", "--quiet", linked)
    if not (linked / ".git").is_file() or git(linked, env, "rev-parse", "--path-format=absolute",
                                            "--git-common-dir") != str(main / ".git"):
        raise RuntimeError("Expected a linked checkout with a separate Git Common Dir")
    return {"kind": "worktree", "parent": str(linked), "child": str(other), "outside": str(main)}


NOTES_REF = "refs/notes/commits"
NOTE_LIMIT = 64 * 1024


def notes_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("notes-primary", "notes-other"))
    primary.mkdir(parents=True)
    git(primary, env, "init", "--quiet", "--initial-branch=main")
    cases = {}
    for kind in ("literal", "missing", "empty", "exact", "oversized", "error"):
        subject = f"Native F42 {kind} commit"
        (primary / "fixture.txt").write_text(f"{subject} patch line\n", encoding="utf-8")
        git(primary, env, "add", "--", "fixture.txt")
        git(primary, env, "commit", "--quiet", "-m", subject, "-m", "Ordinary F42 commit body")
        cases[kind] = {"sha": git(primary, env, "rev-parse", "HEAD"), "subject": subject}
        if kind == "literal":
            # The same full commit ID in both repos makes path isolation observable.
            shutil.copytree(primary, other)

    def add_note(repo, case, value):
        payload = root / "tmp/note-payload"
        payload.write_bytes(value)
        blob = git(repo, env, "hash-object", "-w", payload)
        git(repo, env, "notes", f"--ref={NOTES_REF}", "add", "--allow-empty", "-C", blob, case["sha"])
        case["blob"] = blob
        payload.unlink()
        return blob

    literal = "<strong>Plain text</strong> *Markdown*\nDeuxième ligne — 本文\n"
    other_literal = "Independent repo note for the same commit ID\n"
    add_note(primary, cases["literal"], literal.encode("utf-8"))
    add_note(primary, cases["empty"], b"")
    add_note(primary, cases["exact"], b"x" * NOTE_LIMIT)
    add_note(primary, cases["oversized"], b"y" * (NOTE_LIMIT + 1))
    missing_blob = add_note(primary, cases["error"], b"Synthetic missing blob\n")
    (primary / ".git/objects" / missing_blob[:2] / missing_blob[2:]).unlink()
    cases["other"] = {key: cases["literal"][key] for key in ("sha", "subject")}
    add_note(other, cases["other"], other_literal.encode("utf-8"))
    # A separate Notes ref must not turn the missing default note into a hit.
    git(primary, env, "notes", "--ref=acceptance-other", "add", "-m", "Outside default notes",
        cases["missing"]["sha"])
    return {"kind": "notes", "parent": str(primary), "child": str(other), "outside": str(root),
            "cases": cases, "literal": literal, "otherLiteral": other_literal}


def verify_notes_trace(trace, spec):
    starts, exits = {}, {}
    for line in trace.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        if event["event"] == "start":
            starts[event["sid"]] = event["argv"]
        elif event["event"] == "exit":
            exits[event["sid"]] = event["code"]
    expected_ipc = []
    expected_git = []
    for kind in ("literal", "missing", "empty", "exact", "oversized", "error", "other", "literal"):
        case = spec["cases"][kind]
        path = spec["child"] if kind == "other" else spec["parent"]
        sha = case["sha"]
        expected_ipc.append((path, sha))
        expected_git.extend([
            (path, ["rev-parse", "--is-bare-repository", "--is-inside-work-tree",
                    "--show-object-format", "--show-prefix"], 0),
            (path, ["--git-dir=.git", "cat-file", "-t", sha], 0),
            (path, ["--git-dir=.git", "notes", f"--ref={NOTES_REF}", "list", sha],
             1 if kind == "missing" else 0),
        ])
        if kind == "missing":
            continue
        blob = case["blob"]
        expected_git.append((path, ["--git-dir=.git", "cat-file", "-t", blob], 128 if kind == "error" else 0))
        if kind != "error":
            expected_git.append((path, ["--git-dir=.git", "cat-file", "-s", blob], 0))
            if kind != "oversized":
                expected_git.append((path, ["--git-dir=.git", "cat-file", "blob", blob], 0))

    observed_git = []
    inspect_paths = set()
    for sid, argv in starts.items():
        if "-C" not in argv:
            raise RuntimeError(f"Git process without fixture checkout: {argv}")
        index = argv.index("-C")
        path, args = argv[index + 1], argv[index + 2:]
        if path not in (spec["parent"], spec["child"]):
            raise RuntimeError(f"Unexpected Git path: {argv}")
        if "--no-pager" in argv[:index]:
            observed_git.append((path, args, exits.get(sid)))
        elif args[0] == "show":
            if "--no-notes" not in args or exits.get(sid) != 0:
                raise RuntimeError(f"Normal commit details did not pass with notes disabled: {argv}")
            inspect_paths.add(path)
        elif any(arg in ("notes", "fetch", "push", "pull", "remote-ext", "remote-https") for arg in args):
            raise RuntimeError(f"Unexpected Notes or transport command: {argv}")
    if inspect_paths != {spec["parent"], spec["child"]} or observed_git != expected_git:
        raise RuntimeError(f"Unexpected native Git trace: {observed_git}")
    print(f"NATIVE_NOTES_GIT verified {len(observed_git)} real Notes subprocesses, "
          "including exit 1 for a missing mapping and exit 128 for a missing blob. "
          "Both normal commit detail paths used --no-notes.")
    return expected_ipc


def compare_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("compare-primary", "compare-other"))
    for path in (primary, other):
        path.mkdir(parents=True)
        git(path, env, "init", "--quiet", "--initial-branch=main")

    def commit(path, label):
        marker = f"native-f46-{label}"
        (path / "fixture.txt").write_text(f"{marker}\n", encoding="utf-8")
        git(path, env, "add", "--", "fixture.txt")
        git(path, env, "commit", "--quiet", "-m", marker)
        return {"sha": git(path, env, "rev-parse", "HEAD"), "marker": marker}

    cases = {label: commit(primary, label) for label in ("base", "local", "tag", "remote")}
    # Keep the external mutation to a single loose ref file.
    git(primary, env, "-c", "core.logAllRefUpdates=false",
        "update-ref", "refs/heads/release", cases["local"]["sha"])
    git(primary, env, "tag", "-a", "release", "-m", "Annotated fixture", cases["tag"]["sha"])
    git(primary, env, "update-ref", "refs/remotes/origin/release", cases["remote"]["sha"])
    git(primary, env, "update-ref", "refs/remotes/origin/main", cases["base"]["sha"])
    git(primary, env, "tag", "refs/heads/release", cases["tag"]["sha"])
    cases["otherBase"] = commit(other, "other-base")
    cases["other"] = commit(other, "other")
    return {"kind": "compare", "parent": str(primary), "child": str(other), "outside": str(root),
            "cases": cases, "tagObject": git(primary, env, "rev-parse", "refs/tags/release")}


def compare_rename_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("rename-main", "rename-other"))
    for path in (primary, other):
        path.mkdir(parents=True)
        git(path, env, "init", "--quiet", "--initial-branch=main")
        (path / "old.txt").write_text("Original fixture document\n", encoding="utf-8")
        git(path, env, "add", "old.txt")
        git(path, env, "commit", "--quiet", "-m", "Original document")
    base = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "mv", "old.txt", "new.txt")
    git(primary, env, "commit", "--quiet", "-m", "Move document")
    moved = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "checkout", "-b", "rewrite")
    (primary / "new.txt").write_text("Unrelated replacement material\n", encoding="utf-8")
    git(primary, env, "add", "new.txt")
    git(primary, env, "commit", "--quiet", "-m", "Rewrite moved document")
    rewritten = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "checkout", "main")
    for head, expected in [
        (moved, {"R100\told.txt\tnew.txt"}),
        (rewritten, {"A\tnew.txt", "D\told.txt"}),
    ]:
        actual = set(git(primary, env, "diff", "--name-status", "--find-renames", "-l1000", base, head, "--").splitlines())
        if actual != expected:
            raise RuntimeError(f"Unexpected Git rename oracle for {head}: {actual}")
    return {"kind": "compare", "compareRename": True, "parent": str(primary), "child": str(other),
            "outside": str(root), "cases": {"base": base, "moved": moved, "rewritten": rewritten}}


def search_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("search-sha256", "search-sha1"))
    for path, object_format in ((primary, "sha256"), (other, "sha1")):
        path.mkdir(parents=True)
        git(path, env, "init", "--quiet", "--initial-branch=main", f"--object-format={object_format}")
        if git(path, env, "rev-parse", "--show-object-format") != object_format:
            raise RuntimeError(f"Unexpected fixture object format: {path.name}")

    def commit(path, label):
        subject = f"Native F51 {label}"
        (path / "fixture.txt").write_text(f"{subject}\n", encoding="utf-8")
        git(path, env, "add", "--", "fixture.txt")
        git(path, env, "commit", "--quiet", "-m", subject)
        return {"sha": git(path, env, "rev-parse", "HEAD"), "subject": subject}

    old = commit(primary, "outside initial page")
    for index in range(80):
        git(primary, env, "commit", "--quiet", "--allow-empty", "-m", f"Native F51 padding {index}")
    loaded = commit(primary, "SHA-256 loaded match")
    blob = git(primary, env, "rev-parse", "HEAD:fixture.txt")
    missing = "e" * 64
    git(primary, env, "commit", "--quiet", "--allow-empty", "-m",
        "Native F51 text-only decoy", "-m", f"{loaded['sha']} {blob} {missing}")
    sha1 = commit(other, "SHA-1 loaded match")
    git(other, env, "commit", "--quiet", "--allow-empty", "-m", f"Native F51 mention {sha1['sha']}")
    page = git(primary, env, "log", "--all", "--max-count=80", "--format=%H").splitlines()
    absent = subprocess.run(["/usr/bin/git", "-C", primary, "cat-file", "-e", missing], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if old["sha"] in page or loaded["sha"] not in page or absent.returncode != 1:
        raise RuntimeError("Unexpected fixture page or object availability")
    if git(primary, env, "cat-file", "-t", blob) != "blob":
        raise RuntimeError("Expected a local non-commit object")
    return {"kind": "search", "parent": str(primary), "child": str(other), "outside": str(root),
            "cases": {"old": old, "loaded": loaded, "blob": blob, "missing": missing, "other": sha1}}


def history_text_fixture(root, env):
    repos = root / "repos"
    def commit(path, subject, body, encoding):
        message = f"{subject}\n\n{body}\n".encode(encoding)
        (path / "fixture.txt").write_text(f"{subject}\n", encoding="utf-8")
        git(path, env, "add", "--", "fixture.txt")
        subprocess.run(["/usr/bin/git", "-C", path, "-c", f"i18n.commitEncoding={encoding}",
                        "commit", "--quiet", "-F", "-"], input=message, env=env, check=True)
        sha = git(path, env, "rev-parse", "HEAD")
        raw = subprocess.check_output(["/usr/bin/git", "-C", path, "cat-file", "commit", sha], env=env)
        header, stored = raw.split(b"\n\n", 1)
        latin1 = encoding == "ISO-8859-1"
        if stored != message or (b"\nencoding ISO-8859-1" in header) != latin1:
            raise RuntimeError(f"Unexpected commit encoding in {sha}")
        return {"sha": sha, "subject": subject, "body": body}

    cases = {}
    for key, object_format, width in (("primary", "sha256", 64), ("other", "sha1", 40)):
        path = repos / object_format
        path.mkdir(parents=True)
        git(path, env, "init", "--quiet", "--initial-branch=main", f"--object-format={object_format}")
        git(path, env, "config", "i18n.logOutputEncoding", "ISO-8859-1")
        if key == "primary":
            cases["older"] = commit(path, "Réunion ancienne", "Le procès-verbal.", "ISO-8859-1")
            for index in range(80):
                git(path, env, "commit", "--quiet", "--allow-empty", "-m", f"Native F40 padding {index}")
        utf8 = commit(path, f"Crème {object_format}", "Déjà vu, côté été.", "UTF-8")
        latin1 = commit(path, f"Café {object_format}", "À bientôt, chère équipe.", "ISO-8859-1")
        cases[key] = [latin1, utf8]
        if any(len(case["sha"]) != width for case in cases[key]):
            raise RuntimeError(f"Unexpected fixture object format for {path}")
        raw = subprocess.check_output(["/usr/bin/git", "-C", path, "log", "-2", "--format=%s"], env=env)
        expected = "".join(f"{case['subject']}\n" for case in cases[key]).encode("ISO-8859-1")
        if raw != expected:
            raise RuntimeError(f"Expected ordinary Git output to honor the Latin-1 configuration for {path}")
    return {"kind": "search", "historyText": True, "parent": str(repos / "sha256"),
            "child": str(repos / "sha1"), "outside": str(root), "cases": cases}


def history_path_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("history-main", "history-other"))
    for repo in (primary, other):
        repo.mkdir(parents=True)
        git(repo, env, "init", "--quiet", "--initial-branch=main")
        (repo / "fixture.txt").write_text("Fixture\n", encoding="utf-8")
        git(repo, env, "add", "fixture.txt")
        git(repo, env, "commit", "--quiet", "-m", "Fixture base")
    (primary / "docs").mkdir()
    (primary / "docs/old.txt").write_text("Document\n", encoding="utf-8")
    git(primary, env, "add", "docs/old.txt")
    git(primary, env, "commit", "--quiet", "-m", "Add document")
    original = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "branch", "side")
    git(primary, env, "mv", "docs/old.txt", "docs/topic.txt")
    git(primary, env, "commit", "--quiet", "-m", "Rename document")
    renamed = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "checkout", "side")
    (primary / "notes.txt").write_text("Side work\n", encoding="utf-8")
    git(primary, env, "add", "notes.txt")
    git(primary, env, "commit", "--quiet", "-m", "Add side notes")
    side = git(primary, env, "rev-parse", "HEAD")
    git(primary, env, "checkout", "main")
    git(primary, env, "merge", "--no-ff", "-m", "Merge side work", "side")
    merge = git(primary, env, "rev-parse", "HEAD")
    if git(primary, env, "show", "-s", "--format=%P", merge).split() != [renamed, side]:
        raise RuntimeError("Expected a two-parent fixture merge")
    if git(primary, env, "diff", "--name-only", renamed, merge, "--", "docs/"):
        raise RuntimeError("Expected the selected directory to be unchanged relative to the first parent")
    return {"kind": "search", "historyPath": True, "parent": str(primary), "child": str(other),
            "outside": str(root), "cases": {"merge": merge, "renamed": renamed, "original": original}}


def history_dates_fixture(root, env):
    primary, other = (root / "repos" / name for name in ("dates-main", "dates-other"))
    for repo in (primary, other):
        repo.mkdir(parents=True)
        git(repo, env, "init", "--quiet", "--initial-branch=main")

    def commit(repo, subject, author, committer):
        (repo / "fixture.txt").write_text(f"{subject}\n", encoding="utf-8")
        git(repo, env, "add", "fixture.txt")
        git(repo, {**env, "GIT_AUTHOR_DATE": author, "GIT_COMMITTER_DATE": committer},
            "commit", "--quiet", "-m", subject)
        sha = git(repo, env, "rev-parse", "HEAD")
        author_iso, committer_iso, author_raw, committer_raw = git(
            repo, env, "show", "-s", "--date=default", "--format=%aI%n%cI%n%ad%n%cd", sha
        ).splitlines()
        if (author_iso, committer_iso) != (author, committer):
            raise RuntimeError(f"Unexpected fixture Git dates: {author_iso}, {committer_iso}")
        return {"sha": sha, "subject": subject, "authorISO": author_iso, "committerISO": committer_iso,
                "authorRaw": author_raw, "committerRaw": committer_raw}

    same = "2025-07-09T10:00:00+02:00"
    equal = commit(primary, "Same Git dates", same, same)
    different = commit(primary, "Different Git dates",
                       "2025-07-10T11:15:00+02:00", "2025-07-11T14:00:00-04:00")
    commit(other, "Other fixture repository", same, same)
    return {"kind": "search", "historyDates": True, "parent": str(primary), "child": str(other),
            "outside": str(root), "cases": {"different": different, "equal": equal}}


def run_external_phases(process, on_line):
    deadline = time.monotonic() + 100
    buffer = b""
    output = []
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while True:
            if not selector.select(max(0, deadline - time.monotonic())):
                raise subprocess.TimeoutExpired(process.args, 100)
            block = os.read(process.stdout.fileno(), 65536)
            if not block:
                break
            buffer += block
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                line = line.decode("utf-8", errors="replace")
                print(line, flush=True)
                output.append(line)
                on_line(line)
    if buffer:
        print(buffer.decode("utf-8", errors="replace"), flush=True)
    process.wait(timeout=max(0.1, deadline - time.monotonic()))
    return "\n".join(output)


def run_worktree_phases(process, root, env, spec):
    # Only this Python process runs external Git. The app's sandbox denies all repo writes.
    primary = Path(spec["outside"])
    extras = [root / "repos" / f"catalog-external-{i}" for i in (1, 2, 3)]
    phases = iter((("add", 5), ("remove", 2), ("inactive-add", 3)))
    pending = next(phases)

    def advance(line):
        nonlocal pending
        if not line.startswith("NATIVE_WORKTREE_PHASE "):
            return
        if not pending or line != f"NATIVE_WORKTREE_PHASE {pending[0]}":
            raise RuntimeError(f"Unexpected fixture phase: {line}")
        phase, expected = pending
        for target in extras if phase != "inactive-add" else extras[:1]:
            if phase == "remove":
                git(primary, env, "worktree", "remove", target)
            else:
                git(primary, env, "worktree", "add", "--detach", "--quiet", target)
        count = sum(entry.startswith("worktree ") for entry in
                    git(primary, env, "worktree", "list", "--porcelain").splitlines())
        if count != expected:
            raise RuntimeError(f"Unexpected external catalog size in {phase}: {count}")
        print(f"NATIVE_WORKTREE_EXTERNAL {phase} {count}", flush=True)
        pending = next(phases, None)

    output = run_external_phases(process, advance)
    if pending:
        raise RuntimeError(f"Fixture stopped before external phase {pending[0]}")
    results = [json.loads(line.removeprefix("NATIVE_WORKTREE_RESULT ")) for line in output.splitlines()
               if line.startswith("NATIVE_WORKTREE_RESULT ")]
    if process.returncode or len(results) != 1 or results[0]["ok"] is not True:
        raise RuntimeError("Native worktree acceptance failed; see the fixture trace")


def run_compare_phases(process, env, spec):
    deleted = False

    def advance(line):
        nonlocal deleted
        if line == "NATIVE_COMPARE_PHASE delete":
            if deleted:
                raise RuntimeError("Duplicate compare deletion request")
            path = spec["parent"]
            git(path, env, "update-ref", "-d", "refs/heads/release", spec["cases"]["local"]["sha"])
            deleted = True
            if git(path, env, "rev-parse", "refs/heads/release^{commit}") != spec["cases"]["tag"]["sha"]:
                raise RuntimeError("Expected a DWIM fallback despite the missing exact fixture ref")
            print("NATIVE_COMPARE_EXTERNAL deleted only refs/heads/release; DWIM fallback still resolves", flush=True)

    output = run_external_phases(process, advance)
    if not deleted:
        raise RuntimeError("Native compare did not reach the external ref deletion")
    return output


def compare_ipc_calls(output):
    return [json.loads(line.removeprefix("NATIVE_COMPARE_IPC ")) for line in output.splitlines()
            if line.startswith("NATIVE_COMPARE_IPC ")]


def verify_compare_trace(trace, output, spec):
    calls = compare_ipc_calls(output)
    cases = spec["cases"]
    base = cases["base"]["sha"]
    expected = [("refs/remotes/origin/main", "HEAD"), (base, "refs/heads/release"),
                (base, "refs/tags/release"), (base, "refs/remotes/origin/release"),
                ("HEAD~1", cases["remote"]["sha"]), (base, "refs/heads/release"),
                (base, "refs/heads/release"), ("HEAD~1", "HEAD")]
    summaries = [call for call in calls if call["command"] == "repo_compare_commits"]
    if [(call["base"], call["head"]) for call in summaries] != expected:
        raise RuntimeError(f"Unexpected compare summary IPC: {summaries}")
    if [call["path"] for call in summaries] != [spec["parent"]] * 7 + [spec["child"]]:
        raise RuntimeError(f"Unexpected compare repository IPC: {summaries}")
    diffs = [(call["path"], call["base"], call["head"], call["file"]) for call in calls
             if call["command"] == "repo_compare_file_diff"]
    expected_diffs = [(spec["parent"], base, cases[label]["sha"], "fixture.txt")
                      for label in ("remote", "local", "tag", "remote")]
    expected_diffs += [(spec["parent"], cases["tag"]["sha"], cases["remote"]["sha"], "fixture.txt"),
                       (spec["parent"], base, cases["local"]["sha"], "fixture.txt"),
                       (spec["child"], cases["otherBase"]["sha"], cases["other"]["sha"], "fixture.txt")]
    if diffs != expected_diffs:
        raise RuntimeError(f"Unexpected pinned diff IPC: {diffs}")

    reads = list(compare_git_reads(trace, spec))
    for ref in ("refs/heads/release", "refs/tags/release", "refs/remotes/origin/release"):
        args = ["show-ref", "--verify", "--hash", "--", ref]
        if (args, 0) not in reads:
            raise RuntimeError(f"Missing exact Git lookup: {ref}")
    if (["rev-parse", "--verify", "--end-of-options", f"{spec['tagObject']}^{{commit}}"], 0) not in reads:
        raise RuntimeError("Missing annotated tag object peeling")
    if not any(args == ["show-ref", "--verify", "--hash", "--", "refs/heads/release"] and code
               for args, code in reads):
        raise RuntimeError("Missing failed exact lookup after external deletion")
    print(f"NATIVE_COMPARE_GIT verified {len(reads)} processes, {len(summaries)} summary and {len(diffs)} pinned diff IPC.")


def compare_git_reads(trace, spec):
    events = [json.loads(line) for line in trace.read_text(encoding="utf-8").splitlines()]
    exits = {event["sid"]: event["code"] for event in events if event["event"] == "exit"}
    for event in events:
        if event["event"] != "start":
            continue
        argv = event["argv"]
        if "-C" not in argv:
            raise RuntimeError(f"Git process without fixture checkout: {argv}")
        index = argv.index("-C")
        path, args = argv[index + 1], argv[index + 2:]
        read = (args[0] in ("rev-parse", "show-ref", "for-each-ref", "log", "status", "rev-list",
                            "merge-base", "diff")
                or args[:2] in (["--literal-pathspecs", "diff"], ["stash", "list"], ["symbolic-ref", "--quiet"])
                or args in (["remote", "-v"], ["config", "--null", "--name-only", "--list"])
                or (args[0] == "config" and any(arg in ("--get", "--get-regexp") for arg in args)))
        if path not in (spec["parent"], spec["child"]) or not read:
            raise RuntimeError(f"Unexpected Git process in compare fixture: {argv}")
        yield args, exits.get(event["sid"])


def verify_compare_rename_trace(trace, output, spec):
    calls = compare_ipc_calls(output)
    base, moved, rewritten = (spec["cases"][key] for key in ("base", "moved", "rewritten"))
    summaries = [(call["base"], call["head"]) for call in calls if call["command"] == "repo_compare_commits"]
    diffs = [(call["base"], call["head"], call["file"], call["previousFile"])
             for call in calls if call["command"] == "repo_compare_file_diff"]
    if (summaries != [("HEAD~1", "HEAD"), (base, rewritten)] or
            diffs != [(base, moved, "new.txt", "old.txt"),
                      (base, rewritten, "new.txt", None), (base, rewritten, "old.txt", None)] or
            any(call["path"] != spec["parent"] for call in calls)):
        raise RuntimeError(f"Unexpected rename comparison IPC: {calls}")
    reads = list(compare_git_reads(trace, spec))
    for head in (moved, rewritten):
        for flag in ("--name-status", "--numstat"):
            if not any(code == 0 and args[0] == "diff" and flag in args and "--find-renames" in args and
                       "-l1000" in args and args[-3:] == [base, head, "--"] for args, code in reads):
                raise RuntimeError(f"Missing Git summary with {flag} for {head}")
    patches = [args[args.index("--") + 1:] for args, code in reads
               if code == 0 and args[:2] == ["--literal-pathspecs", "diff"] and "--find-renames" in args]
    if patches != [["new.txt", "old.txt"], ["new.txt"], ["old.txt"]]:
        raise RuntimeError(f"Unexpected Git pathname selection for file patches: {patches}")
    print(f"NATIVE_COMPARE_RENAME_GIT verified {len(reads)} Git reads, {len(summaries)} summaries and {len(diffs)} file diffs.")


def search_ipc_calls(output):
    prefix = "NATIVE_SEARCH_IPC "
    return [json.loads(line.removeprefix(prefix)) for line in output.splitlines() if line.startswith(prefix)]


def verify_search_trace(trace, output, spec):
    calls = search_ipc_calls(output)
    primary, other = spec["parent"], spec["child"]
    cases = spec["cases"]
    history_text = spec.get("historyText", False)
    queries = [(call["path"], call["query"]) for call in calls if call["command"] == "repo_search_commits"]
    if history_text:
        entries = [(path, case) for key, path in (("primary", primary), ("other", other)) for case in cases[key]]
        expected = [(path, query) for path, case in entries for query in (case["sha"].upper(), case["body"])]
        expected_details = [(path, case["sha"]) for path, case in entries]
    else:
        loaded, sha1 = cases["loaded"]["sha"], cases["other"]["sha"]
        expected = [(primary, cases["old"]["sha"]), (primary, cases["blob"]), (primary, loaded.upper()),
                    (primary, cases["missing"]), (other, sha1), (other, loaded)]
        expected_details = [(primary, loaded), (other, sha1)]
    if queries != expected:
        raise RuntimeError(f"Unexpected native search IPC: {queries}")
    details = [(call["path"], call["commit"]) for call in calls if call["command"] == "repo_commit_inspect"]
    if details != expected_details:
        raise RuntimeError(f"Unexpected native detail IPC: {details}")
    pages = [call["skip"] for call in calls if call["command"] == "repo_log_page" and call["path"] == primary]
    if history_text and 80 not in pages:
        raise RuntimeError("Expected native history pagination at offset 80")
    if not history_text and pages:
        raise RuntimeError("The SHA-256 fixture loaded another history page during the navigation check")

    reads, formats, scans, inspections = 0, [], [], []
    initial_page = False
    for path, args, code in search_git_reads(trace, spec):
        if history_text:
            reads_message = ((args[0] == "log" and any("%s" in arg and "%b" in arg for arg in args)) or
                             (args[0] == "show" and "--format=fuller" in args))
            if reads_message and ("--encoding=UTF-8" not in args or code != 0):
                raise RuntimeError(f"Expected a successful UTF-8 Git message read: {args}")
        reads += 1
        if code != 0:
            continue
        if args == ["rev-parse", "--show-object-format"]:
            formats.append(path)
        if path == primary and args[:3] == ["log", "-z", "--max-count=80"] and "--all" in args:
            initial_page = True
        if args[:4] == ["log", "-z", "--no-show-signature", "--no-notes"] and "--all" in args:
            scans.append(path)
        if args[0] == "show" and "--format=fuller" in args:
            inspections.append((path, args[-1]))
    paths = [path for path, _ in queries]
    if not initial_page or formats != paths or scans != paths or inspections != details:
        raise RuntimeError(f"Unexpected search Git evidence: {initial_page=} {formats=} {scans=} {inspections=}")
    pagination = ("Verified SHA-256 history pagination at offset 80." if history_text else
                  "No additional SHA-256 history page was loaded.")
    print(f"NATIVE_SEARCH_GIT verified {reads} local read processes, {len(scans)} search IPC "
          f"and {len(inspections)} exact detail IPC. {pagination}")


def search_git_reads(trace, spec):
    events = [json.loads(line) for line in trace.read_text(encoding="utf-8").splitlines()]
    exits = {event["sid"]: event["code"] for event in events if event["event"] == "exit"}
    for event in events:
        if event["event"] != "start":
            continue
        argv = event["argv"]
        if "-C" not in argv:
            raise RuntimeError(f"Git process without fixture checkout: {argv}")
        index = argv.index("-C")
        path, args = argv[index + 1], argv[index + 2:]
        read = (args[0] in ("rev-parse", "show-ref", "for-each-ref", "log", "status", "rev-list", "show", "diff-tree")
                or args[:2] in (["stash", "list"], ["symbolic-ref", "--quiet"])
                or args in (["diff", "--cached", "--numstat", "-z"], ["diff", "--numstat", "-z"])
                or (args[:2] == ["--literal-pathspecs", "diff-tree"]
                    and "--no-ext-diff" in args and "--no-textconv" in args
                    and args[-2:] == ["--", "fixture.txt"])
                or args in (["remote", "-v"], ["config", "--null", "--name-only", "--list"],
                            ["config", "--null", "--list"])
                or (args[0] == "config" and any(arg in ("--get", "--get-regexp") for arg in args)))
        if path not in (spec["parent"], spec["child"]) or not read:
            raise RuntimeError(f"Unexpected Git process in search fixture: {argv}")
        yield path, args, exits.get(event["sid"])


def verify_history_path_trace(trace, output, spec):
    calls = [call for call in search_ipc_calls(output) if call["command"] == "repo_history_page"]
    expected = [("docs/", ""), (":(glob)docs/**", ""), ("docs/topic.txt", ""),
                ("docs/", "document"), ("", "document")]
    actual = [(call["filter"]["file"], call["filter"]["query"]) for call in calls]
    if actual != expected or any(call["path"] != spec["parent"] or call["skip"] != 0 for call in calls):
        raise RuntimeError(f"Unexpected history filter IPC: {calls}")
    reads = list(search_git_reads(trace, spec))
    logs = [args for path, args, code in reads if path == spec["parent"] and code == 0 and args[0] == "log"]
    path_logs = [args for args in logs if args[-2:-1] == ["--"]]
    if [(args[-1], "--follow" in args, "--name-status" in args, "--grep=document" in args)
            for args in path_logs] != [(file, file == "docs/topic.txt", file == "docs/topic.txt", bool(query))
                                       for file, query in expected if file]:
        raise RuntimeError(f"Unexpected Git path history commands: {path_logs}")
    if not any(args[:3] == ["log", "-z", "--max-count=80"] and "--" not in args for args in logs):
        raise RuntimeError("Missing regular graph log")
    if not any("--grep=document" in args and args[-1] == "--" for args in logs):
        raise RuntimeError("Missing search-only Git history query after removing the path")
    print(f"NATIVE_HISTORY_PATH_GIT verified {len(reads)} local reads and {len(calls)} history filter IPC calls.")


def verify_history_dates_trace(trace, output, spec):
    calls = search_ipc_calls(output)
    shas = [spec["cases"][key]["sha"] for key in ("different", "equal")]
    expected = [(spec["parent"], sha) for sha in shas]
    actual = [(call["path"], call["commit"]) for call in calls if call["command"] == "repo_commit_inspect"]
    if actual != expected:
        raise RuntimeError(f"Unexpected native date inspection IPC: {actual}")
    reads = list(search_git_reads(trace, spec))
    shown = [(path, args[-1]) for path, args, code in reads
             if code == 0 and args[0] == "show" and "--format=fuller" in args]
    if shown != expected:
        raise RuntimeError(f"Unexpected Git fuller reads: {shown}")
    if not any(path == spec["parent"] and args[:3] == ["log", "-z", "--max-count=80"]
               and any("%cI" in arg for arg in args) and code == 0 for path, args, code in reads):
        raise RuntimeError("Missing native regular history log with committer dates")
    print(f"NATIVE_HISTORY_DATES_GIT verified {len(reads)} local Git reads and {len(actual)} native fuller IPC calls.")


def partial_clone_fixture(root, env):
    source, partial = root / "repos/source", root / "repos/partial"
    source.mkdir(parents=True)
    git(source, env, "init", "--quiet", "--initial-branch=main")
    git(source, env, "config", "uploadpack.allowFilter", "true")

    def commit(subject, **files):
        for name, content in files.items():
            (source / name).write_text(content)
        git(source, env, "add", "--", *files)
        git(source, env, "commit", "--quiet", "-m", subject)
        return git(source, env, "rev-parse", "HEAD")

    base = commit("Large parent content", **{
        "missing.txt": "large parent content\n" * 64, "present.txt": "old fixture line\n",
    })
    tip = commit("Partial clone tip", **{
        "missing.txt": "small current content\n", "present.txt": "readable fixture line\n",
    })
    git(source, {**env, "GIT_ALLOW_PROTOCOL": "file"}, "clone", "--quiet",
        "--no-local", "--no-checkout", "--filter=blob:limit=100", "--", source.as_uri(), str(partial))
    git(partial, env, "reset", "--hard", tip)
    ordinary_base = commit("Locally authored content", **{"ordinary.txt": "unpromised old content\n"})
    ordinary = commit("Ordinary read error tip", **{"ordinary.txt": "ordinary new content\n"})
    ordinary_oid = git(source, env, "rev-parse", f"{ordinary_base}:ordinary.txt")
    (source / ".git/objects" / ordinary_oid[:2] / ordinary_oid[2:]).unlink()
    # Configuration alone must not cause the missing-content explanation.
    git(source, env, "config", "remote.origin.promisor", "true")
    git(source, env, "config", "--unset", "uploadpack.allowFilter")
    local_url = git(partial, env, "remote", "get-url", "origin")
    if local_url != source.as_uri():
        raise RuntimeError("Partial clone remote is outside the fixture")

    def missing_oid(repo, commit_oid, name):
        oid = git(repo, env, "rev-parse", f"{commit_oid}:{name}")
        marker = git(repo, env, "rev-list", "--objects", "--no-object-names", "--missing=print", oid)
        if marker != f"?{oid}":
            raise RuntimeError("Fixture blob unexpectedly present")
        return oid

    missing_oid(partial, base, "missing.txt")
    missing_oid(source, ordinary_base, "ordinary.txt")
    return {"kind": "search", "partialClone": True, "parent": str(partial), "child": str(source),
            "outside": str(root), "cases": {"partial": tip, "ordinary": ordinary}}


def verify_partial_clone_trace(trace, spec):
    events = [json.loads(line) for line in trace.read_text().splitlines()]
    exits = {event["sid"]: event["code"] for event in events if event["event"] == "exit"}
    reads = []
    for event in events:
        if event["event"] != "start":
            continue
        argv = event["argv"]
        if "fetch" in argv or "git-upload-pack" in argv:
            raise RuntimeError("Acceptance attempted to fetch from its file remote")
        if "-C" not in argv:
            raise RuntimeError("Git process without a fixture checkout")
        index = argv.index("-C")
        path, args = argv[index + 1], argv[index + 2:]
        if path not in (spec["parent"], spec["child"]):
            raise RuntimeError("Git process outside the two fixture checkouts")
        reads.append((path, args, exits.get(event["sid"])))

    for repo, file, missing, expected_exit in (
        ("parent", "missing.txt", True, 0),
        ("parent", "present.txt", False, None),
        ("child", "ordinary.txt", True, 128),
    ):
        local = [(args, code) for path, args, code in reads if path == spec[repo]]
        if not any("diff-tree" in args and "-p" in args and args[-1] == file for args, _ in local):
            raise RuntimeError(f"No real file patch process for {file}")
        if missing:
            for mode, exit_code in (("--missing=print", 0), ("--missing=allow-promisor", expected_exit)):
                if not any(mode in args and args[-1] == file and code == exit_code for args, code in local):
                    raise RuntimeError(f"Missing object-proof probe for {file} with {mode}")
    print(f"Verified {len(reads)} fixture Git processes, zero fetch and upload-pack starts.", flush=True)


def snapshot(root, allowed_changes=()):
    return {
        str(path.relative_to(root)): (path.stat().st_mode, hashlib.sha256(path.read_bytes()).hexdigest())
        for path in root.rglob("*") if path.is_file()
        and not any(path.is_relative_to(root / allowed) for allowed in allowed_changes)
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--staging-metadata", action="store_true", help="run the F39 staging fixture")
    modes.add_argument("--worktree-catalog", action="store_true", help="run the F05 worktree fixture")
    modes.add_argument("--commit-notes", action="store_true", help="run the F42 local commit notes fixture")
    modes.add_argument("--qualified-compare", action="store_true", help="run the F46 qualified compare fixture")
    modes.add_argument("--compare-rename", action="store_true", help="run the F58 native rename explanation fixture")
    modes.add_argument("--commit-search", action="store_true", help="run the F51 full commit ID search fixture")
    modes.add_argument("--history-text", action="store_true", help="run the F40 UTF-8 history text fixture")
    modes.add_argument("--history-path", action="store_true", help="run the F62 native path history fixture")
    modes.add_argument("--history-dates", action="store_true", help="run the F54 native author and committer dates fixture")
    modes.add_argument("--partial-clone", action="store_true", help="run the F59 native commit-file fixture")
    parser.add_argument("--headless", action="store_true", help="run F59 production Rust commands without WKWebView")
    args = parser.parse_args()
    if args.headless and not args.partial_clone:
        parser.error("--headless requires --partial-clone")
    staging, worktree = args.staging_metadata, args.worktree_catalog
    if sys.platform != "darwin" or not Path(SANDBOX).is_file():
        raise SystemExit("The runner requires macOS sandbox-exec and WKWebView.")
    if not BIN.is_file() or not (ROOT / "dist/index.html").is_file():
        raise SystemExit("Build the production frontend and the native_submodule_acceptance example first.")
    notes = args.commit_notes
    compare = args.qualified_compare or args.compare_rename
    search = args.commit_search or args.history_text or args.history_path or args.history_dates or args.partial_clone
    mode = ("partial-clone" if args.partial_clone else "history-dates" if args.history_dates else "history-path" if args.history_path else "history-text" if args.history_text else
            "search" if search else "compare-rename" if args.compare_rename else "compare" if compare else "notes" if notes else
            "worktrees" if worktree else "staging" if staging else "submodules")
    verify_repo_state = notes or compare or search
    with tempfile.TemporaryDirectory(prefix=f"l8git-native-{mode}-") as temp:
        root = Path(temp).resolve()
        home, scratch = root / "home", root / "tmp"
        home.mkdir()
        scratch.mkdir()
        (home / ".native-submodule-acceptance").touch()
        env = {
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(home), "TMPDIR": str(scratch),
            "LANG": "en_US.UTF-8", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_OPTIONAL_LOCKS": "0", "GIT_AUTHOR_NAME": "Native Fixture",
            "GIT_AUTHOR_EMAIL": "native@example.invalid", "GIT_COMMITTER_NAME": "Native Fixture",
            "GIT_COMMITTER_EMAIL": "native@example.invalid",
        }
        create_fixture = {"notes": notes_fixture, "worktrees": worktree_fixture,
                          "staging": staging_fixture, "submodules": submodule_fixture,
                          "compare": compare_fixture, "compare-rename": compare_rename_fixture, "search": search_fixture,
                          "history-text": history_text_fixture, "history-path": history_path_fixture,
                          "history-dates": history_dates_fixture, "partial-clone": partial_clone_fixture}[mode]
        if verify_repo_state:
            env["GIT_ALLOW_PROTOCOL"] = ""
            env["GIT_NO_LAZY_FETCH"] = "1"
        spec = create_fixture(root, env)
        (root / "fixture.json").write_text(json.dumps(spec))
        env["GIT_ALLOW_PROTOCOL"] = ""
        env["GIT_NO_LAZY_FETCH"] = "1"
        repos = root / "repos"
        repo = Path(spec["parent"])
        if verify_repo_state:
            def repo_state():
                return [(git(path, env, "show-ref", "--head"), git(path, env, "status", "--porcelain"),
                         git(path, env, "remote")) for path in (spec["parent"], spec["child"])]

            initial_repo_state = repo_state()
            expected_remotes = ["origin", "origin"] if args.partial_clone else ["", ""]
            if any(dirty for _, dirty, _ in initial_repo_state) or [
                remotes for _, _, remotes in initial_repo_state
            ] != expected_remotes:
                raise RuntimeError("Read-only fixture status or remote set is unexpected")
        if worktree:
            allowed_changes = ("catalog-main/.git/worktrees", "catalog-external-1")
        elif args.qualified_compare:
            allowed_changes = ("compare-primary/.git/refs/heads/release",)
        else:
            allowed_changes = ("staging/.git/index", "staging/.git/objects") if staging else ()
        before = snapshot(repos, allowed_changes)
        if staging:
            if git(repo, env, "remote") or git(repo, env, "diff", "--cached"):
                raise RuntimeError("Staging fixture requires no remote and an initially clean index")
            original_diff = git(repo, env, "diff", "--no-color", "--no-ext-diff", "--no-textconv")
            write_policy = f"""(deny file-write*)
        (allow file-write*
            (subpath {json.dumps(str(repo / '.git'))})
            (subpath {json.dumps(str(home))})
            (subpath {json.dumps(str(scratch))})
            (literal "/dev/null"))"""
        elif worktree or verify_repo_state:
            write_policy = f"""(deny file-write*)
        (allow file-write*
            (subpath {json.dumps(str(home))})
            (subpath {json.dumps(str(scratch))})
            (literal "/dev/null"))"""
        else:
            write_policy = f"""(deny file-write* (subpath {json.dumps(str(Path.home().resolve()))}))
        (deny file-write* (subpath {json.dumps(str(repos))}))"""
        profile = f"""(version 1)
        (allow default)
        (deny network-outbound (remote ip))
        (deny network-bind (local ip))
        (deny network-inbound (local ip))
        {write_policy}
        """
        command = [SANDBOX, "-p", profile]
        probe = """
import errno, pathlib, socket, sys
def require_denied(action):
    try:
        action()
    except OSError as error:
        if error.errno in (errno.EACCES, errno.EPERM):
            return
        raise
    raise RuntimeError('Sandbox unexpectedly allowed a protected operation')
with socket.socket() as endpoint:
    require_denied(lambda: endpoint.bind(('127.0.0.1', 0)))
for path in sys.argv[2:]:
    require_denied(lambda: open(path, 'ab'))
if sys.argv[1]:
    probe = pathlib.Path(sys.argv[1])
    with probe.open('xb') as file:
        file.write(b'scratch index write probe')
    probe.unlink()
"""
        writable_probe = str(repo / ".git/acceptance-probe") if staging else ""
        if args.partial_clone:
            protected = [str(Path(path) / file) for path in (spec["parent"], spec["child"])
                         for file in (".git/config", ".git/index", ".git/HEAD", ".git/refs/heads/main", "present.txt")]
        elif args.compare_rename:
            protected = [str(repo / file) for file in ("new.txt", ".git/config", ".git/refs/heads/main")]
            protected += [str(Path(spec["child"]) / ".git/index")]
        elif compare:
            protected = [str(repo / "fixture.txt"), str(repo / ".git/HEAD"),
                         str(repo / ".git/refs/heads/release"), str(Path(spec["child"]) / ".git/index")]
        elif search:
            protected = [str(repo / "fixture.txt"), str(repo / ".git/refs/heads/main"),
                         str(Path(spec["child"]) / ".git/HEAD"), str(Path(spec["child"]) / ".git/index")]
            if args.history_text or args.history_path or args.history_dates:
                protected.extend(str(Path(path) / ".git/config") for path in (spec["parent"], spec["child"]))
        elif notes:
            protected = [str(repo / "fixture.txt"), str(repo / ".git/refs/notes/commits"),
                         str(Path(spec["child"]) / ".git/refs/notes/commits")]
        elif worktree:
            protected = [str(repo / "fixture.txt"), str(Path(spec["outside"]) / ".git/config")]
        else:
            protected = [str(repo / "mode.sh"), str(root / "protected")] if staging else [str(repo / "app.txt")]
        subprocess.run([*command, sys.executable, "-I", "-c", probe, writable_probe, *protected],
                       env=env, check=True)
        sandbox_proof = ("only fixture Git data and private app data writable; worktree and outside-file writes denied"
                         if staging else "writes to the synthetic repositories denied")
        print(f"Sandbox preflight passed: IP bind denied; {sandbox_proof}.", flush=True)

        trace = scratch / "git-trace.jsonl"
        app_env = {**env, "GIT_TRACE2_EVENT": str(trace)} if verify_repo_state else env
        if args.headless:
            command.append(BIN)
            command.append("--partial-clone-headless")
        else:
            command.append(BIN)
        process = subprocess.Popen(command, cwd=root, env=app_env, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            if worktree:
                run_worktree_phases(process, root, env, spec)
                output = ""
            elif args.qualified_compare:
                output = run_compare_phases(process, env, spec)
            else:
                output, _ = process.communicate(timeout=100)
        except (subprocess.TimeoutExpired, KeyboardInterrupt, RuntimeError, subprocess.CalledProcessError):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            output, _ = process.communicate()
            print(output, end="")
            raise
        finally:
            if before != snapshot(repos, allowed_changes):
                raise RuntimeError("Protected fixture files changed during native acceptance")
        if not args.qualified_compare:
            print(output, end="", flush=True)
        print(f"Protected fixture snapshot unchanged ({len(before)} files).", flush=True)
        if worktree:
            print("Owned native process exited and temporary profile and fixtures will be removed.", flush=True)
            return
        result_prefix = ("F59_HEADLESS_RESULT " if args.headless else "NATIVE_SEARCH_RESULT " if search else
                         "NATIVE_COMPARE_RESULT " if compare else "NATIVE_NOTES_RESULT " if notes else
                         "NATIVE_STAGING_RESULT " if staging else "NATIVE_SUBMODULE_RESULT ")
        results = [json.loads(line.removeprefix(result_prefix))
                   for line in output.splitlines() if line.startswith(result_prefix)]
        if process.returncode or len(results) != 1 or not results[0]["ok"]:
            raise SystemExit("Native acceptance failed; see the runner output.")
        if notes:
            expected = verify_notes_trace(trace, spec)
            prefix = "NATIVE_NOTES_IPC "
            calls = [json.loads(line.removeprefix(prefix))
                     for line in output.splitlines() if line.startswith(prefix)]
            if [(call["path"], call["commit"]) for call in calls] != expected:
                raise RuntimeError("Unexpected commit or repository in native Notes IPC")
            if repo_state() != initial_repo_state:
                raise RuntimeError("Fixture refs, status or remotes changed during Notes acceptance")
            print("Fixture refs, clean status and absence of remotes independently verified with local Git.")
        if args.compare_rename:
            verify_compare_rename_trace(trace, output, spec)
            if repo_state() != initial_repo_state:
                raise RuntimeError("Fixture refs, status or remotes changed during rename acceptance")
            print("Fixture refs, HEAD, clean status and absence of remotes verified with local Git.")
        elif compare:
            refs, dirty, remotes = initial_repo_state[0]
            expected_refs = "\n".join(line for line in refs.splitlines() if not line.endswith(" refs/heads/release"))
            if repo_state() != [(expected_refs, dirty, remotes), initial_repo_state[1]]:
                raise RuntimeError("Compare fixture changed beyond the one external ref deletion")
            verify_compare_trace(trace, output, spec)
            print("Remaining refs, HEAD, clean status and absence of remotes verified with local Git.")
        if args.partial_clone:
            verify_partial_clone_trace(trace, spec)
            if not args.headless:
                prefix = "NATIVE_SEARCH_IPC "
                calls = [json.loads(line.removeprefix(prefix)) for line in output.splitlines()
                         if line.startswith(prefix)]
                diffs = {(call["path"], call["commit"], call["file"]) for call in calls
                         if call["command"] == "repo_commit_file_diff"}
                cases = spec["cases"]
                if diffs != {(spec["parent"], cases["partial"], "missing.txt"),
                             (spec["parent"], cases["partial"], "present.txt"),
                             (spec["child"], cases["ordinary"], "ordinary.txt")}:
                    raise RuntimeError("Unexpected native F59 file diff IPC")
            if repo_state() != initial_repo_state:
                raise RuntimeError("Fixture refs, status or remotes changed during F59 acceptance")
            print("Fixture refs, HEAD, clean status and synthetic remote set verified with local Git.")
        elif search:
            if args.history_path:
                verify_history_path_trace(trace, output, spec)
            elif args.history_dates:
                verify_history_dates_trace(trace, output, spec)
            else:
                verify_search_trace(trace, output, spec)
            if repo_state() != initial_repo_state:
                raise RuntimeError("Fixture refs, status or remotes changed during search acceptance")
            print("Fixture refs, HEAD, clean status and absence of remotes verified with local Git.")
        if staging:
            expected = ["stage_files", "unstage_files", "git_apply_reviewed_hunks:stage",
                        "git_apply_reviewed_hunks:unstage"]
            prefix = "NATIVE_STAGING_MUTATION "
            seen = [line.removeprefix(prefix) for line in output.splitlines() if line.startswith(prefix)]
            if seen != expected:
                raise RuntimeError(f"Unexpected mutation trace: {seen}")
            if (git(repo, env, "remote") or git(repo, env, "diff", "--cached")
                    or git(repo, env, "diff", "--no-color", "--no-ext-diff", "--no-textconv") != original_diff):
                raise RuntimeError("Fixture must finish with a clean index and the original working-tree patch")
            print("Mutation sequence, final index and working-tree diff independently verified with local Git.")
    if search or args.compare_rename:
        if process.poll() is None or root.exists():
            raise RuntimeError("Native process or temporary fixture still exists after cleanup")
        tag = ("F59_CLEANUP" if args.partial_clone else
               "NATIVE_COMPARE_RENAME_CLEANUP" if args.compare_rename else "NATIVE_SEARCH_CLEANUP")
        print(f"{tag} process {process.pid} exited and private fixture directory was removed.")
    else:
        print("Owned native process exited and temporary profile and fixtures were removed.")


if __name__ == "__main__":
    main()
