# Native submodule acceptance on macOS

The opt-in runner opens the production frontend in a separate Tauri/Wry window and calls the real repository and diff commands through Tauri IPC. Use a macOS desktop session reserved for this run, with `sandbox-exec`, Python 3.9 or newer and the project's existing build dependencies.

```sh
bun run build
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features headless --bin l8git --example native_submodule_acceptance
python3 -I scripts/native-submodule-acceptance.py
```

The launcher creates a temporary home and synthetic Git repositories. It checks that the sandbox denies IP binding and fixture writes before launching the example. The sandbox also denies outbound IP and writes to the normal home directory. The window uses nonpersistent WebKit storage and serves the built assets through Tauri's custom protocol. The IPC allowlist accepts only application reads for two exact fixture paths. Production plugins, credentials and background services are absent from the runner. The test verifies empty WebKit storage and rejects an out-of-scope repository and a synthetic keychain request through the live bridge.

The runner compares a file digest and mode snapshot of the repositories before and after the window, then removes the temporary home and fixtures. It closes its own instance after reporting the result. A timeout terminates the launcher’s own process group.

## Recorded result

Passed on Apple silicon macOS 27.0.1 (26A434) with Apple Git 2.54.0. The sandbox preflight passed and all 192 fixture files retained their contents and modes.

- F21 opened the initialized checkout as the active tab under its canonical path and retained the parent tab.
- F20 showed the exact HEAD-to-index commits and the child patch from `native-original` to `native-index`.
- F20 showed the exact index-to-checkout commits and the child patch from `native-index` to `native-checkout`.
- F20 distinguished an uninitialized checkout, a commit absent from the local child object store and a dirty checkout with identical pins.

The scope is the macOS WebKit renderer with real local Tauri IPC in a fixture-specific launcher. Signed packaging, production startup services and Windows or Linux runtime remain outside this run.
