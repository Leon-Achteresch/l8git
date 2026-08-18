use clap::Parser;
use l8git_relay::{serve, RelayState};

#[derive(Parser)]
#[command(name = "l8git-relay", version, about = "Blind WebSocket relay for l8git Remote")]
struct Cli {
    #[arg(long, default_value_t = 8485, help = "TCP port")]
    port: u16,
    #[arg(long, default_value = "0.0.0.0", help = "Bind address")]
    bind: String,
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let cli = Cli::parse();
    match serve(RelayState::new(), &cli.bind, cli.port).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("l8git-relay: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
