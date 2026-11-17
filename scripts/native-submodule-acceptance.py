#!/usr/bin/env python3
"""Launch only the opt-in macOS Wry/IPC acceptance executable."""

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


def fixture(root, env):
    repos = root / "repos"
    repos.mkdir()
    source, parent = repos / "source", repos / "parent"

    def git(repo, *args):
        return subprocess.check_output(
            ["/usr/bin/git", "-C", repo, *args], env=env, text=True, stderr=subprocess.PIPE
        ).strip()

    def commit(repo, file, content):
        (repo / file).write_text(content + "\n")
        git(repo, "add", "--", file)
        git(repo, "commit", "--quiet", "-m", content)
        return git(repo, "rev-parse", "HEAD")

    for repo in (source, parent):
        repo.mkdir()
        git(repo, "init", "--quiet", "--initial-branch=main")
    commit(parent, "app.txt", "native-parent")
    before = commit(source, "lib.txt", "native-original")
    for name in ("live", "uninitialized", "unavailable", "dirty"):
        git(parent, "-c", "protocol.file.allow=always", "submodule", "add", "--name", name,
            "--", source.as_uri(), f"vendor/{name}")
    git(parent, "commit", "--quiet", "-m", "Register synthetic submodules")
    live = parent / "vendor/live"
    index = commit(live, "lib.txt", "native-index")
    git(parent, "add", "--", "vendor/live")
    checkout = commit(live, "lib.txt", "native-checkout")
    missing = commit(source, "lib.txt", "native-only-in-source")
    git(parent, "update-index", "--cacheinfo", f"160000,{index},vendor/uninitialized")
    git(parent, "update-index", "--cacheinfo", f"160000,{missing},vendor/unavailable")
    # Remove only the known synthetic checkout's gitfile; keep its directory
    # and the staged link, so both pins remain available from the parent diff.
    (parent / "vendor/uninitialized/.git").unlink()
    (parent / "vendor/dirty/lib.txt").write_text("native-dirty-only\n")
    git(live, "config", "diff.external", str(root / "forbidden-diff-helper"))
    git(live, "config", "diff.acceptance.textconv", str(root / "forbidden-textconv-helper"))
    (live / ".gitattributes").write_text("lib.txt diff=acceptance\n")
    return {"parent": str(parent), "child": str(live), "outside": str(source),
            "before": before, "index": index, "checkout": checkout}


def snapshot(root):
    return {
        str(path.relative_to(root)): (path.stat().st_mode, hashlib.sha256(path.read_bytes()).hexdigest())
        for path in root.rglob("*") if path.is_file()
    }


def main():
    if sys.platform != "darwin" or not Path(SANDBOX).is_file():
        raise SystemExit("The runner requires macOS sandbox-exec and WKWebView.")
    if not BIN.is_file() or not (ROOT / "dist/index.html").is_file():
        raise SystemExit("Build the production frontend and the native_submodule_acceptance example first.")
    with tempfile.TemporaryDirectory(prefix="l8git-native-submodules-") as temp:
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
        spec = fixture(root, env)
        (root / "fixture.json").write_text(json.dumps(spec))
        env["GIT_ALLOW_PROTOCOL"] = ""
        env["GIT_NO_LAZY_FETCH"] = "1"
        repos = root / "repos"
        before = snapshot(repos)
        profile = f"""(version 1)
        (allow default)
        (deny network-outbound (remote ip))
        (deny network-bind (local ip))
        (deny network-inbound (local ip))
        (deny file-write* (subpath {json.dumps(str(Path.home().resolve()))}))
        (deny file-write* (subpath {json.dumps(str(repos))}))
        """
        command = [SANDBOX, "-p", profile]
        probe = """
import errno, socket, sys
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
require_denied(lambda: open(sys.argv[1], 'ab'))
"""
        subprocess.run([*command, sys.executable, "-I", "-c", probe, str(repos / "parent/app.txt")],
                       env=env, check=True)
        print("Sandbox preflight passed: IP bind and writes to the synthetic repositories denied.", flush=True)

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
            if before != snapshot(repos):
                raise RuntimeError("Fixture files were changed during native acceptance")
        print(output, end="", flush=True)
        print(f"Fixture snapshot unchanged ({len(before)} files).", flush=True)
        results = [json.loads(line.removeprefix("NATIVE_SUBMODULE_RESULT "))
                   for line in output.splitlines() if line.startswith("NATIVE_SUBMODULE_RESULT ")]
        if process.returncode or len(results) != 1 or not results[0]["ok"]:
            raise SystemExit("Native submodule acceptance failed; see the runner output.")


if __name__ == "__main__":
    main()
