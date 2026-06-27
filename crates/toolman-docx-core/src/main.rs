use std::path::PathBuf;

use clap::{Parser, Subcommand};
use toolman_docx_core::{
    convert_to_docx_with_options, detect_file_kind, native_format, ConvertOptions,
};

#[derive(Parser)]
#[command(name = "toolman-docx-core", about = "Toolman Word format bridge (.doc/.wps → .docx)")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Detect file kind from extension + office_oxide magic sniffing
    Detect {
        #[arg(long)]
        input: PathBuf,
    },
    /// Convert any supported Word format to .docx
    Convert {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        cache_dir: Option<PathBuf>,
    },
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Detect { input } => {
            let kind = detect_file_kind(&input);
            let native = native_format(&input).map(|format| format!("{format:?}"));
            let payload = serde_json::json!({
                "kind": kind,
                "native_format": native,
            });
            println!("{}", serde_json::to_string_pretty(&payload)?);
        }
        Commands::Convert {
            input,
            output,
            cache_dir,
        } => {
            let resolved_cache_dir = cache_dir.or_else(|| {
                std::env::var("TOOLMAN_DOCX_CACHE_DIR")
                    .ok()
                    .map(PathBuf::from)
            });
            let kind = convert_to_docx_with_options(
                &input,
                &output,
                ConvertOptions {
                    cache_dir: resolved_cache_dir,
                },
            )
            .await?;
            let payload = serde_json::json!({
                "kind": kind,
                "output": output,
            });
            println!("{}", serde_json::to_string_pretty(&payload)?);
        }
    }
    Ok(())
}
