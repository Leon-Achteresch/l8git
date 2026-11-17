# Linux CLI pairing and RPC acceptance

Run this on a disposable Linux VM or runtime with a fresh, dedicated Linux user and a functioning kernel keyring. Separate the runtime from other users' kernel credentials. The build selects `keyring/linux-native`, which uses Linux Keyutils. A private D-Bus or Secret Service session cannot supply this backend. Keyutils can link credentials to the user's persistent keyring, so a fresh session alone does not isolate a user's existing credentials.

Build from the checkout root with the repository's Linux Tauri build dependencies and a populated Cargo cache. Keep the runtime loopback-only for the acceptance run. The current CLI binds the requested port on all interfaces.

```sh
export CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0
cargo build --offline --locked --manifest-path src-tauri/Cargo.toml --features headless --bin l8gitd
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features headless --lib --no-run
export L8GIT_CLI_BIN="$(realpath "${CARGO_TARGET_DIR:-src-tauri/target}/debug/l8gitd")"
```

After isolating networking, test whether the runtime can create a private session and add a disposable user key. Run under the same dedicated user that will run the CLI. An `Operation not permitted` at either step prevents the native CLI acceptance in that runtime.

```sh
keyctl session - sh -ec '
  probe=$(printf %s disposable | keyctl padd user l8git-fixture-probe @s)
  keyctl unlink "$probe" @s
'
```

Run the acceptance test in a new unnamed session so the three CLI children inherit one private keyring. The test checks that the l8gitd credential slots are empty before pairing.

```sh
umask 077
keyctl session - env L8GIT_CLI_DISPOSABLE=1 L8GIT_CLI_BIN="$L8GIT_CLI_BIN" \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ALLOW_PROTOCOL=file GIT_TERMINAL_PROMPT=0 \
  cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features headless --lib \
  server::e2e::linux_cli_keyring_acceptance -- --exact --ignored --test-threads=1
```

The test runs `l8gitd pair`, `allow`, and `serve` as separate processes with private HOME and XDG config paths. The pairing output includes a disposable PSK and stays in memory. The client completes the encrypted handshake on a dynamic loopback port, reads the regular `repo_fetch_scope` for a registered checkout with a file remote, and verifies that an unregistered fixture is rejected. The preview does not create `FETCH_HEAD`. The test ends its daemon and removes its temporary files and credentials. Discard the dedicated runtime afterwards.

In the stock Docker Desktop Linux runtime, session lookup, session creation, and adding a user key returned `Operation not permitted`. The previously built standalone CLI reported `Platform secure storage failure: PermissionDenied` before serving. The headless server-wire test with a fixture PSK is a separate server-path proof. Linux GUI and production workspace fetch are outside this acceptance.
