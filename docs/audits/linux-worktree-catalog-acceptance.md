# Linux worktree catalog acceptance

The F05 acceptance uses the regular headless dispatcher, native filesystem watcher and real local Git. The watched checkout has a `.git` file and its Git Common Dir is in a separate temporary parent repository. The test uses a local recording event sink in the test process.

## Reproduce

Use a disposable Linux-arm64 Docker container. The run below seeds a private Cargo home from the public crates.io host cache. Keep the container connected only during dependency provisioning. Use a local Docker filesystem for the fixtures.

```sh
set -eu
name="l8git-f05-watch-$$"
base=78540f63f58064d6e3b96aa19cd4f9e0f9b234f1
registry="${CARGO_HOME:-$HOME/.cargo}/registry"
public_index=index.crates.io-1949cf8c6b5b557f

docker run -d --name "$name" --platform linux/arm64 --cpus 2 --memory 5g \
  --security-opt no-new-privileges=true \
  --mount "type=bind,src=$registry/cache/$public_index,dst=/seed/cache,readonly" \
  --mount "type=bind,src=$registry/index/$public_index,dst=/seed/index,readonly" \
  rust:1.95.0-bookworm sleep infinity
trap 'docker rm -f "$name" >/dev/null' EXIT

docker exec "$name" sh -ec '
  mkdir -p /fixture
  useradd -u 18058 -m -d /fixture/home fixture
  install -d -o fixture -g fixture /fixture/source /fixture/cargo /fixture/tmp /fixture/target
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
    libxdo-dev libssl-dev patchelf
'
git archive "$base" | docker exec --user 18058 -i "$name" tar -xf - -C /fixture/source

docker exec --user 18058 -w /fixture/source -e HOME=/fixture/home \
  -e CARGO_HOME=/fixture/cargo "$name" sh -ec '
  cache=/fixture/cargo/registry/cache/index.crates.io-1949cf8c6b5b557f
  index=/fixture/cargo/registry/index/index.crates.io-1949cf8c6b5b557f
  mkdir -p "$cache" "$index"
  cp -R /seed/cache/. "$cache/"
  cp -R /seed/index/. "$index/"
  cargo fetch --offline --locked --target aarch64-unknown-linux-gnu --manifest-path src-tauri/Cargo.toml ||
    cargo fetch --locked --target aarch64-unknown-linux-gnu --manifest-path src-tauri/Cargo.toml
'

docker network disconnect bridge "$name"
test "$(docker inspect --format '{{len .NetworkSettings.Networks}}' "$name")" -eq 0
docker exec --user 18058 -w /fixture/source -e HOME=/fixture/home \
  -e XDG_CONFIG_HOME=/fixture/home/.config -e XDG_DATA_HOME=/fixture/home/.local/share \
  -e CARGO_HOME=/fixture/cargo -e CARGO_TARGET_DIR=/fixture/target -e TMPDIR=/fixture/tmp \
  "$name" sh -ec '
  umask 077
  test "$(id -u)" = 18058
  test "$(wc -l </proc/net/route)" -eq 1
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ALLOW_PROTOCOL=
  export GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0
  export CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0
  cargo test --offline --locked --manifest-path src-tauri/Cargo.toml \
    --features headless --test git_worktree_watch -- --test-threads=2
'
```

## Recorded result

Passed twice on Debian Bookworm arm64 with LinuxKit kernel 7.0.14, Docker overlayfs, Git 2.39.5 and Rust 1.95.0. The base image manifest digest was `sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1`. The test ran as UID 18058 with zero effective capabilities, `NoNewPrivs=1` and no attached Docker network or IPv4 route. An offline fetch identified missing Linux crates, including `zbus` and `inotify`. Cargo filled the private cache before the network was detached. The locked build and test then ran offline.

- The [checked-in test](../../src-tauri/tests/git_worktree_watch.rs) passed in 7.78 s. Three external adds and three external removes produced one catalog notification per burst for the linked checkout. The real `list_worktrees` results were 2 → 5 → 2.
- An ordinary file edit and index update produced zero catalog notifications. The test also checked quiet periods before changes and over a further directory-stat cycle after removal.
- A repeat of the same compiled test passed in 7.74 s. Inspection of `/proc/<test-pid>/fdinfo` confirmed live `anon_inode:inotify` registrations by matching the inode numbers for both the Git Common Dir and the `worktrees` directory. The normal directory-stat fallback remained enabled. The private test fixture directory was empty after the repeat.

The dispatcher fixture and recording sink cover the Linux watcher and catalog reads. The existing macOS and private Chromium evidence still covers its original scopes. Linux Tauri window behavior, daemon delivery of the local notification, Windows and network filesystems have separate acceptance boundaries.
