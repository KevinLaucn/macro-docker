use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "localstack_provision",
    about = "Idempotently provision Macro LocalStack AWS resources"
)]
struct Args {
    /// LocalStack endpoint URL (e.g. http://localhost:4566 or http://localstack:4566)
    #[arg(long, default_value = "http://localhost:4566")]
    url: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    println!("Provisioning LocalStack resources against {}...", args.url);
    xtask_local::local::localstack::provision_url(&args.url).await?;
    println!("LocalStack resources provisioned successfully.");
    Ok(())
}
