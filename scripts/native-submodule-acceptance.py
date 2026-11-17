#!/usr/bin/env python3
"""Launch only the opt-in macOS WKWebView acceptance fixture."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile

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


def snapshot(root, allowed_changes=()):
    return {
        str(path.relative_to(root)): (path.stat().st_mode, hashlib.sha256(path.read_bytes()).hexdigest())
        for path in root.rglob("*") if path.is_file()
        and not any(path.is_relative_to(root / allowed) for allowed in allowed_changes)
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging-metadata", action="store_true", help="run the F39 staging fixture")
    staging = parser.parse_args().staging_metadata
    if sys.platform != "darwin" or not Path(SANDBOX).is_file():
        raise SystemExit("The runner requires macOS sandbox-exec and WKWebView.")
    if not BIN.is_file() or not (ROOT / "dist/index.html").is_file():
        raise SystemExit("Build the production frontend and the native_submodule_acceptance example first.")
    with tempfile.TemporaryDirectory(prefix="l8git-native-staging-" if staging else "l8git-native-submodules-") as temp:
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
        spec = staging_fixture(root, env) if staging else submodule_fixture(root, env)
        (root / "fixture.json").write_text(json.dumps(spec))
        env["GIT_ALLOW_PROTOCOL"] = ""
        env["GIT_NO_LAZY_FETCH"] = "1"
        repos = root / "repos"
        repo = Path(spec["parent"])
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
        protected = [str(repo / "mode.sh"), str(root / "protected")] if staging else [str(repo / "app.txt")]
        subprocess.run([*command, sys.executable, "-I", "-c", probe, writable_probe, *protected],
                       env=env, check=True)
        sandbox_proof = ("only fixture Git data and private app data writable; worktree and outside-file writes denied"
                         if staging else "writes to the synthetic repositories denied")
        print(f"Sandbox preflight passed: IP bind denied; {sandbox_proof}.", flush=True)

        process = subprocess.Popen([*command, BIN], cwd=root, env=env, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            output, _ = process.communicate(timeout=100)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
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
        print(output, end="", flush=True)
        print(f"Protected fixture snapshot unchanged ({len(before)} files).", flush=True)
        result_prefix = "NATIVE_STAGING_RESULT " if staging else "NATIVE_SUBMODULE_RESULT "
        results = [json.loads(line.removeprefix(result_prefix))
                   for line in output.splitlines() if line.startswith(result_prefix)]
        if process.returncode or len(results) != 1 or not results[0]["ok"]:
            raise SystemExit("Native acceptance failed; see the runner output.")
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
    print("Owned native process exited and temporary profile and fixtures were removed.")


if __name__ == "__main__":
    main()
