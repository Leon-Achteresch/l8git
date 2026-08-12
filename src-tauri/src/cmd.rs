use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) fn git_command() -> Command {
    cli_command("git")
}

/// Every CLI we drive headlessly must start through here: on Windows a bare
/// `Command` opens a console window per child, and the agent CLIs resolve to
/// `.cmd` shims that CreateProcess runs via cmd.exe.
pub(crate) fn cli_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    cmd
}

pub(crate) fn apply_no_window(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = cmd;
    }
}

#[cfg(test)]
mod tests {
    /// Ein blankes `Command::new` in den CLI-Modulen öffnet auf Windows wieder
    /// ein Konsolenfenster pro Kindprozess (die Agent-CLIs sind .cmd-Shims).
    #[test]
    fn cli_modules_spawn_without_console_window() {
        for file in ["agent_transport.rs", "claude.rs", "cursor.rs"] {
            let path = format!("{}/src/{file}", env!("CARGO_MANIFEST_DIR"));
            let src = std::fs::read_to_string(&path).expect(&path);
            assert!(
                !src.contains("Command::new("),
                "{file}: benutze cli_command() statt Command::new()"
            );
        }
    }
}
