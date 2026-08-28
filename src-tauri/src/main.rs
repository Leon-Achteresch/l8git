// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Codex, OpenCode and Cursor reach l8git's Jira tools by spawning this same
    // binary as an MCP server over stdio. The GUI subsystem on Windows only
    // suppresses allocating a console; inherited pipes still work, so this is
    // safe there too. Bail out before Tauri boots so no window is created.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some(l8git_lib::jira_mcp::SUBCOMMAND) {
        l8git_lib::jira_mcp::serve_stdio(args);
    }
    l8git_lib::run()
}
