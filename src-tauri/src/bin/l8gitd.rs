use std::net::TcpStream;
use std::time::Duration;

use clap::{Parser, Subcommand};
use l8git_lib::server::{config, pairing, sink, state, ws};

#[derive(Parser)]
#[command(name = "l8gitd", version, about = "l8git Remote headless host")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    #[command(about = "Startet den WebSocket-Host für die Mobile-App")]
    Serve {
        #[arg(long, help = "TCP-Port (Default 8484)")]
        port: Option<u16>,
    },
    #[command(about = "Erzeugt bzw. zeigt hostId + psk als QR-Code und JSON")]
    Pair,
    #[command(about = "Zeigt Pairing, Konfiguration und Endpunkte")]
    Status,
    #[command(about = "Gibt einen Repo-Root für Remote-Zugriffe frei")]
    Allow {
        #[arg(help = "Absoluter Pfad zu einem Repo-Root")]
        path: String,
    },
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    if std::env::args().nth(1).as_deref() == Some(l8git_lib::renderer_mcp::SUBCOMMAND) {
        l8git_lib::renderer_mcp::serve_stdio();
    }
    let cli = Cli::parse();
    let outcome = match cli.command {
        Command::Serve { port } => serve(port).await,
        Command::Pair => pair(),
        Command::Status => status(),
        Command::Allow { path } => allow(&path),
    };
    match outcome {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            // The desktop app sets this to capture stderr and translate the code; everyone else gets plain text.
            let error = if std::env::var_os(l8git_lib::error::CODED_STDERR_ENV).is_some() {
                error
            } else {
                l8git_lib::error::message_only(&error)
            };
            eprintln!("l8gitd: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}

fn effective_port(cli_port: Option<u16>, config: &config::Config) -> u16 {
    cli_port.or(config.port).unwrap_or(config::DEFAULT_PORT)
}

async fn serve(cli_port: Option<u16>) -> Result<(), String> {
    let paired = pairing::load()?
        .ok_or_else(|| l8git_lib::coded!(RemoteNotPaired))?;
    let mut config = config::load();
    let port = effective_port(cli_port, &config);
    if config.port != Some(port) {
        config.port = Some(port);
        let _ = config::save(&config);
    }

    let roots = config::roots(&config);
    if roots.is_empty() {
        eprintln!("l8gitd: kein Repo-Root freigegeben — `l8gitd allow <path>` ausführen.");
    }
    let server = state::ServerState::new(paired.host_id.clone(), paired.psk()?, roots);
    sink::install(&server);

    let shutdown = server.clone();
    tokio::select! {
        result = ws::serve(server.clone(), port) => result,
        _ = tokio::signal::ctrl_c() => {
            shutdown.unwatch_all();
            Ok(())
        }
    }
}

fn pair() -> Result<(), String> {
    let paired = pairing::load_or_create()?;
    let config = config::load();
    let port = effective_port(None, &config);
    let payload = pairing::payload(&paired, port);
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    println!("{}", pairing::qr(&json)?);
    println!("{json}");
    Ok(())
}

fn status() -> Result<(), String> {
    let config = config::load();
    let port = effective_port(None, &config);
    let paired = pairing::load()?;
    println!("host:     {}", state::hostname());
    println!("version:  {}", env!("CARGO_PKG_VERSION"));
    match &paired {
        Some(p) => println!("hostId:   {}", p.host_id),
        None => println!("hostId:   (nicht gepaart)"),
    }
    println!("config:   {}", config::config_path()?.display());
    println!("port:     {port}");
    println!("listening: {}", if listening(port) { "ja" } else { "nein" });
    if config.roots.is_empty() {
        println!("roots:    (leer)");
    } else {
        println!("roots:");
        for root in &config.roots {
            println!("  {root}");
        }
    }
    if paired.is_some() {
        for endpoint in pairing::endpoints(port) {
            println!("endpoint: {endpoint}");
        }
    }
    Ok(())
}

fn listening(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

fn allow(path: &str) -> Result<(), String> {
    let resolved = config::add_root(path)?;
    println!("freigegeben: {}", resolved.display());
    Ok(())
}
