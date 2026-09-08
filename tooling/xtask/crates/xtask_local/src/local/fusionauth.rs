//! FusionAuth local bootstrap: generate the per-instance kickstart artifacts,
//! wait for readiness, and reconcile local-only config that a preserved data
//! volume may have missed because FusionAuth only applies kickstart once.

use std::process::Command;

use anyhow::{Context, Result, bail};
use serde_json::Value;

use super::instance::{Instance, Port};
use super::{gen_compose, identity, kickstart, stage::Stage};

#[cfg(test)]
mod test;

/// The FusionAuth lambda sources, read from the tracked templates at
/// generation time (anchored on [`xtask_paths::repo_root`], so any cwd works).
/// `populate_jwt_local.js` is the unlicensed local variant (see its header);
/// the reconcile lambda is the same file production deploys via Pulumi.
const POPULATE_JWT_LAMBDA: xtask_paths::RepoFile<'static> =
    xtask_paths::RepoFile::new("infra/stacks/fusionauth-instance/templates/populate_jwt_local.js");
const RECONCILE_LAMBDA: xtask_paths::RepoFile<'static> = xtask_paths::RepoFile::new(
    "infra/stacks/fusionauth-instance/templates/reconcile_secondary_idp_link.js",
);

fn read_lambda(file: xtask_paths::RepoFile<'static>) -> Result<String> {
    let path = xtask_paths::repo_root().join(file.as_str());
    std::fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))
}

/// Generate `kickstart.json` into the instance's kickstart dir, which the
/// FusionAuth container mounts. The kickstart is pure identity-provider config:
/// run_local pre-seeds no users — passwordless login auto-creates any user on
/// demand. `google` (from the resolved run env) additionally configures the
/// `google`/`google_gmail` OIDC IdPs so the email connect flows work locally,
/// and `github` the `github` IdP that `POST /link/github` resolves; the
/// generated file is gitignored, and the init-snapshot key hashes it, so
/// adding/removing either client or the optional admin registration re-inits
/// the stack automatically.
pub fn write_kickstart(
    instance: &Instance,
    google: Option<&kickstart::GoogleIdp>,
    github: Option<&kickstart::GithubIdp>,
    admin: Option<&kickstart::AdminUser>,
) -> Result<()> {
    let dir = gen_compose::kickstart_dir(instance);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("creating kickstart dir {}", dir.display()))?;

    let doc = kickstart::build(
        instance.port(Port::Frontend),
        instance.port(Port::Auth),
        instance.port(Port::DocCognition),
        &read_lambda(POPULATE_JWT_LAMBDA)?,
        &read_lambda(RECONCILE_LAMBDA)?,
        google,
        github,
        admin,
    );
    let json = serde_json::to_string_pretty(&doc)? + "\n";
    std::fs::write(dir.join("kickstart.json"), json)
        .with_context(|| format!("writing {}", dir.join("kickstart.json").display()))?;
    Ok(())
}

/// Block until the kickstart has fully applied (first boot against an empty DB
/// is slow). Runs as a stage so it shows the spinner.
///
/// Polls the kickstart's OWN artifacts — a tenant fetch authorized by the
/// kickstart API key — NOT `/api/status`: FusionAuth reports status Ok while
/// the kickstart is still applying, and the snapshot save stops the containers
/// right after this wait. Gating on status alone once froze a mid-kickstart DB
/// into a snapshot (no tenant), and every stack restored from it 500'd at
/// login with `InvalidTenantIdException` — while the key never changed, so the
/// bad snapshot was sticky. The fetch below succeeds only once the API key,
/// the tenant, and the application all exist (the kickstart creates the
/// application after the tenant).
pub fn wait_ready(stage: &Stage, instance: &Instance) -> Result<()> {
    let url = format!(
        "http://localhost:{}/api/application/{}",
        instance.port(Port::FusionAuth),
        identity::APPLICATION_ID,
    );
    // Require an actual 200: `curl -f` only fails on 400+, so FusionAuth's
    // maintenance-mode 302 (e.g. after a boot-time DB connect failure) would
    // otherwise pass as ready and every later login would 500.
    let script = format!(
        "for i in $(seq 1 120); do [ \"$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 -H 'Authorization: {key}' {url} 2>/dev/null)\" = 200 ] && exit 0; sleep 2; done; \
         echo 'timed out waiting for the FusionAuth kickstart (a 302 here means maintenance mode: FusionAuth could not reach its db)'; exit 1",
        key = identity::FUSIONAUTH_API_KEY,
    );
    let mut cmd = Command::new("bash");
    cmd.arg("-lc").arg(script);
    stage.run("Waiting for FusionAuth (kickstart)", &mut cmd)
}

/// Re-apply the local FusionAuth config that must track the current env even
/// when the FusionAuth data volume already exists and kickstart is skipped.
///
/// This is intentionally scoped to developer-only config: the optional local
/// admin account and Google/Gmail identity providers. It does not delete or
/// rewrite application data, inbox links, or synced email state.
pub fn reconcile_local_config(stage: &Stage, instance: &Instance) -> Result<()> {
    if stage.is_dry_run() {
        return Ok(());
    }

    let kickstart_path = gen_compose::kickstart_dir(instance).join("kickstart.json");
    let raw = std::fs::read_to_string(&kickstart_path)
        .with_context(|| format!("reading {}", kickstart_path.display()))?;
    let doc: Value = serde_json::from_str(&raw)
        .with_context(|| format!("parsing {}", kickstart_path.display()))?;
    let requests = reconcile_requests(&doc);
    if requests.is_empty() {
        return Ok(());
    }

    let base_url = format!("http://localhost:{}", instance.port(Port::FusionAuth));
    let work_dir = instance.ensure_artifact_dir()?.join("fusionauth-reconcile");
    std::fs::create_dir_all(&work_dir)
        .with_context(|| format!("creating {}", work_dir.display()))?;

    stage.run_step("Reconciling FusionAuth local config", || {
        for request in requests {
            apply_reconcile_request(&base_url, &work_dir, request)?;
        }
        Ok(())
    })
}

fn reconcile_requests(doc: &Value) -> Vec<&Value> {
    doc.get("requests")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|request| {
            let Some(url) = request.get("url").and_then(Value::as_str) else {
                return false;
            };
            matches!(
                url,
                "/api/user/registration"
                    | "/api/lambda/66666666-6666-4666-8666-666666666666"
                    | "/api/identity-provider/44444444-4444-4444-8444-444444444444"
                    | "/api/identity-provider/55555555-5555-4555-8555-555555555555"
            )
        })
        .collect()
}

fn apply_reconcile_request(
    base_url: &str,
    work_dir: &std::path::Path,
    request: &Value,
) -> Result<()> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("POST");
    let url = request
        .get("url")
        .and_then(Value::as_str)
        .context("FusionAuth reconcile request is missing url")?;
    let body = request
        .get("body")
        .context("FusionAuth reconcile request is missing body")?;

    if url == "/api/user/registration" {
        reconcile_admin_user(base_url, work_dir, body)?;
        return Ok(());
    }

    let body_path = write_reconcile_body(work_dir, url, body)?;
    let mut status = curl_status(
        Command::new("curl")
            .arg("-sS")
            .arg("-o")
            .arg("/dev/null")
            .arg("-w")
            .arg("%{http_code}")
            .arg("--max-time")
            .arg("10")
            .arg("-X")
            .arg(method)
            .arg("-H")
            .arg(format!("Authorization: {}", identity::FUSIONAUTH_API_KEY))
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("--data-binary")
            .arg(format!("@{}", body_path.display()))
            .arg(format!("{base_url}{url}")),
    )?;
    if !(200..300).contains(&status) && method == "POST" {
        status = curl_status(
            Command::new("curl")
                .arg("-sS")
                .arg("-o")
                .arg("/dev/null")
                .arg("-w")
                .arg("%{http_code}")
                .arg("--max-time")
                .arg("10")
                .arg("-X")
                .arg("PUT")
                .arg("-H")
                .arg(format!("Authorization: {}", identity::FUSIONAUTH_API_KEY))
                .arg("-H")
                .arg("Content-Type: application/json")
                .arg("--data-binary")
                .arg(format!("@{}", body_path.display()))
                .arg(format!("{base_url}{url}")),
        )?;
    }
    if !(200..300).contains(&status) {
        bail!("FusionAuth reconcile request {method} {url} returned HTTP {status}");
    }

    Ok(())
}

fn reconcile_admin_user(base_url: &str, work_dir: &std::path::Path, body: &Value) -> Result<()> {
    let email = body
        .get("user")
        .and_then(|user| user.get("email"))
        .and_then(Value::as_str)
        .context("local admin reconcile is missing user.email")?;
    let password = body
        .get("user")
        .and_then(|user| user.get("password"))
        .and_then(Value::as_str)
        .context("local admin reconcile is missing user.password")?;

    let body_path = write_reconcile_body(work_dir, "/api/user/registration", body)?;
    let create_status = curl_status(
        Command::new("curl")
            .arg("-sS")
            .arg("-o")
            .arg("/dev/null")
            .arg("-w")
            .arg("%{http_code}")
            .arg("--max-time")
            .arg("10")
            .arg("-X")
            .arg("POST")
            .arg("-H")
            .arg(format!("Authorization: {}", identity::FUSIONAUTH_API_KEY))
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("--data-binary")
            .arg(format!("@{}", body_path.display()))
            .arg(format!("{base_url}/api/user/registration")),
    )?;
    if (200..300).contains(&create_status) {
        return Ok(());
    }

    let output = Command::new("curl")
        .arg("-sS")
        .arg("--fail")
        .arg("--max-time")
        .arg("10")
        .arg("--get")
        .arg("-H")
        .arg(format!("Authorization: {}", identity::FUSIONAUTH_API_KEY))
        .arg("--data-urlencode")
        .arg(format!("email={email}"))
        .arg(format!("{base_url}/api/user"))
        .output()
        .context("querying existing FusionAuth local admin")?;
    if !output.status.success() {
        bail!(
            "creating local FusionAuth admin returned HTTP {create_status}, and lookup by email failed"
        );
    }
    let user: Value = serde_json::from_slice(&output.stdout)
        .context("parsing FusionAuth user lookup response")?;
    let user_id = user
        .get("user")
        .and_then(|user| user.get("id"))
        .and_then(Value::as_str)
        .context("FusionAuth user lookup response is missing user.id")?;

    let password_body = serde_json::json!({ "user": { "password": password } });
    let password_body_path = write_reconcile_body(work_dir, "/api/user/password", &password_body)?;
    let update_status = curl_status(
        Command::new("curl")
            .arg("-sS")
            .arg("-o")
            .arg("/dev/null")
            .arg("-w")
            .arg("%{http_code}")
            .arg("--max-time")
            .arg("10")
            .arg("-X")
            .arg("PATCH")
            .arg("-H")
            .arg(format!("Authorization: {}", identity::FUSIONAUTH_API_KEY))
            .arg("-H")
            .arg("Content-Type: application/json")
            .arg("--data-binary")
            .arg(format!("@{}", password_body_path.display()))
            .arg(format!("{base_url}/api/user/{user_id}")),
    )?;
    if !(200..300).contains(&update_status) {
        bail!("updating local FusionAuth admin password returned HTTP {update_status}");
    }

    Ok(())
}

fn write_reconcile_body(
    work_dir: &std::path::Path,
    url: &str,
    body: &Value,
) -> Result<std::path::PathBuf> {
    let file_name = url.trim_matches('/').replace('/', "_").replace('-', "_");
    let path = work_dir.join(format!("{file_name}.json"));
    std::fs::write(&path, serde_json::to_vec(body)?)
        .with_context(|| format!("writing {}", path.display()))?;
    Ok(path)
}

fn curl_status(command: &mut Command) -> Result<u16> {
    let output = command.output().context("running curl")?;
    if !output.status.success() {
        bail!("curl failed while reconciling FusionAuth local config");
    }
    let status = String::from_utf8(output.stdout).context("curl status was not utf8")?;
    status
        .trim()
        .parse()
        .context("curl did not return an HTTP status")
}
