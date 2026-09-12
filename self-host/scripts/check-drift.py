#!/usr/bin/env python3
"""Fail if the self-host artifacts have drifted from the Rust source of truth.

The compose file and Caddyfile are checked in so a self-hoster needs no Rust
toolchain, which means they can silently fall behind the inventory they were
derived from. A service added to `inventory::RUST_SERVICES` that never reaches
self-host/docker-compose.yml is a feature that quietly does not exist in a
self-hosted install; a queue added to `resources::QUEUES` and not to .env.example
is a worker that tight-loops on a queue that was never created.

Sources of truth:
  tooling/xtask/crates/xtask_local/src/local/inventory.rs   services + routes
  tooling/xtask/crates/xtask_local/src/local/resources.rs   buckets/queues/tables
  crates/macro_queues/src/lib.rs                            queue names

Run: python3 self-host/scripts/check-drift.py
"""
from __future__ import annotations
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SELF_HOST = ROOT / "self-host"
failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


## --- inventory -------------------------------------------------------------
inv = (ROOT / "tooling/xtask/crates/xtask_local/src/local/inventory.rs").read_text()
services = []
for block in re.findall(r"RustService \{(.*?)\n    \},", inv, re.S):
    def field(name):
        m = re.search(rf'{name}:\s*(?:Some\("([^"]+)"\)|"([^"]+)"|None|(true|false))', block)
        if not m:
            return None
        return m.group(1) or m.group(2) or m.group(3)
    services.append({
        "compose_name": field("compose_name"),
        "cargo_bin": field("cargo_bin"),
        "path_prefix": field("path_prefix"),
        "is_websocket": field("is_websocket") == "true",
        "modes": re.search(r"modes:\s*&\[([^\]]*)\]", block).group(1),
    })

if len(services) < 10 or any(s["compose_name"] is None or s["cargo_bin"] is None for s in services):
    print(f"could not parse inventory.rs: got {len(services)} services."
          " The regex in this script no longer matches RustService entries.", file=sys.stderr)
    sys.exit(2)

inv_by_bin = {s["cargo_bin"]: s for s in services}
inv_by_compose = {s["compose_name"]: s for s in services}

compose = (SELF_HOST / "docker-compose.yml").read_text()
caddy = (SELF_HOST / "Caddyfile").read_text()
env_example = (SELF_HOST / ".env.example").read_text()
macroctl = (SELF_HOST / "macroctl").read_text()

# A release must not carry host-specific application configuration paths. They
# make an old checkout silently override image-owned or release-owned config.
release_owned_texts = {
    "docker-compose.yml": compose,
    "Caddyfile": caddy,
    "macroctl": macroctl,
}
for path in sorted((SELF_HOST / "scripts").glob("*.py")):
    if path.name == "check-drift.py":
        continue
    release_owned_texts[str(path.relative_to(SELF_HOST))] = path.read_text()
for path in sorted((SELF_HOST / "init").glob("*.sh")):
    release_owned_texts[str(path.relative_to(SELF_HOST))] = path.read_text()
for name, text in release_owned_texts.items():
    if "/home/ubuntu/marco" in text:
        fail(f"{name} must not reference legacy host path /home/ubuntu/marco")

# The production health probe is compiled into authentication_service and DSS
# must use its declared contract key, never the generic internal API key.
probes = (ROOT / "services/authentication_service/src/features/self_host_health/probes.rs").read_text()
auth_match = re.search(r"^  authentication-service:\n(.*?)(?=^  \w|^volumes:)", compose, re.M | re.S)
if not auth_match or "DOCUMENT_STORAGE_SERVICE_AUTH_KEY" not in auth_match.group(1):
    fail("authentication-service must receive DOCUMENT_STORAGE_SERVICE_AUTH_KEY")
if "context.internal_api_key" in probes:
    fail("self-host health DSS probe must not fall back to context.internal_api_key")

# Extract binaries actually executed in self-host/docker-compose.yml
compose_bins = set(re.findall(r'/app/out/([a-zA-Z0-9_-]+)', compose))

# Default Email runtime binaries. The image additionally carries the migration,
# LocalStack provisioning, and optional cognition binaries verified below.
email_required_bins = [
    "authentication_service",
    "connection_gateway_service",
    "contacts_service",
    "document_storage_service",
    "email_service",
    "pubsub_workers",
    "image_proxy_service",
    "notification_service",
    "static_file_service",
    "unfurl_service",
    "search_processing_service",
    "document_upload_finalizer_local_worker",
    "document_cognition_service",
]

# Binaries used only in optional Compose profiles ("full", "agents")
optional_profile_bins = {
    "service",
    "agent_harness_service",
}

for req_bin in email_required_bins:
    if req_bin not in compose_bins:
        fail(f'required email production binary /app/out/{req_bin} missing from docker-compose.yml')

# Validate routes and execution for services declared in Compose
for cargo_bin in compose_bins:
    s = inv_by_bin.get(cargo_bin)
    if not s:
        # Binary used in Compose is not defined in inventory at all
        fail(f'binary /app/out/{cargo_bin} referenced in docker-compose.yml is not in inventory.rs')
        continue
    if s["path_prefix"]:
        if s["path_prefix"] not in caddy:
            fail(f'service {s["compose_name"]}: route {s["path_prefix"]} missing from Caddyfile')
        elif s["is_websocket"] and "uri strip_prefix " + s["path_prefix"] not in caddy:
            fail(f'service {s["compose_name"]}: websocket route {s["path_prefix"]} is not a strip_prefix handler')

# --- localstack_provision single-source-of-truth wiring checks -------------
# Upstream resources.rs and localstack.rs are the SOLE source of truth.
# We no longer duplicate or mirror SQS/S3/DynamoDB/KMS schemas in Python.
# Here we verify the binary wiring and build closure contract.

email_capabilities = json.loads((SELF_HOST / "email-capabilities.json").read_text())

cloud_storage_nix_text = (ROOT / "nix/cloud-storage.nix").read_text()
if 'binaries = [ "localstack_provision" ];' not in cloud_storage_nix_text:
    fail("localstack_provision binary is not declared in selfHostEmailBinaryDefinitions in nix/cloud-storage.nix")

init_dockerfile_text = (SELF_HOST / "init/Dockerfile").read_text()
if 'COPY --from=services /app/out/localstack_provision /usr/local/bin/localstack_provision' not in init_dockerfile_text:
    fail("localstack_provision binary is not copied into self-host init Dockerfile")

provision_sh_text = (SELF_HOST / "init/provision.sh").read_text()
if 'localstack_provision --url' not in provision_sh_text:
    fail("self-host/init/provision.sh must invoke localstack_provision --url")

reconcile_sh = SELF_HOST / "init/reconcile-localstack.sh"
if not reconcile_sh.exists():
    fail("self-host/init/reconcile-localstack.sh does not exist")
else:
    reconcile_sh_text = reconcile_sh.read_text()
    if 'localstack_provision' not in reconcile_sh_text or '--url' not in reconcile_sh_text:
        fail("self-host/init/reconcile-localstack.sh must invoke localstack_provision --url")

if "localstack_reconciler:" not in compose:
    fail("localstack_reconciler sidecar service is missing from docker-compose.yml")
if "reconcile-localstack.sh" not in compose:
    fail("localstack_reconciler must mount/execute reconcile-localstack.sh")

if "localstack-ready.sh" in compose or "10-reconcile-queues.sh" in compose:
    fail("obsolete localstack-ready.sh / 10-reconcile-queues.sh must not be mounted in docker-compose.yml")
if "resources.json" in compose:
    fail("resources.json must not be mounted in docker-compose.yml; upstream resources.rs is the sole source of truth")
if "localstack_data:/persisted-data" not in compose:
    fail("LocalStack persistence must use the named localstack_data volume, not a release-directory bind mount")

required_persistent_volumes = {
    "postgres_data",
    "redis_data",
    "kafka_data",
    "opensearch_data",
    "fusionauth_db_data",
    "fusionauth_config",
    "localstack_data",
    "caddy_data",
    "caddy_config",
    "web_assets",
    "sync_state",
}
volumes_section = compose.split("\nvolumes:\n", 1)[-1]
for volume in sorted(required_persistent_volumes):
    if not re.search(rf"^  {re.escape(volume)}:\s*$", volumes_section, re.M):
        fail(f"persistent Compose volume declaration missing: {volume}")


# --- image and profile invariants ------------------------------------------
workflow = (ROOT / ".github/workflows/self-host-images.yml").read_text()

expected_email_capabilities = {
    "email": True,
    "contacts": True,
    "dss": True,
    "notification": True,
    "websocket": True,
    "cognition": True,
    "scheduled_actions": False,
    "ai_editing": False,
}
if email_capabilities != expected_email_capabilities:
    fail(
        "self-host/email-capabilities.json must stay the Email production "
        f"capability contract; found {email_capabilities!r}"
    )

document_storage_api = (ROOT / "services/document_storage_service/src/api.rs").read_text()
if 'mod items;' not in document_storage_api or '.nest("/items"' not in document_storage_api:
    fail("document_storage_service must expose /dss/items for the Email web UI")

# Ensure macro_db_migrate is part of the binary graph
if 'packageName = "macro_db_migrator";' not in (ROOT / "nix/cloud-storage.nix").read_text():
    fail("macro_db_migrator is not part of the Nix-managed self-host binary graph")

# The default runtime is the conservative Email production profile. Services
# whose binaries are intentionally absent from that image must remain opt-in.
if "ghcr.io/kevinlaucn/macro-services-email" not in compose:
    fail("docker-compose.yml does not default to the Email production services image")
if "ghcr.io/kevinlaucn/macro-init-email" not in compose:
    fail("docker-compose.yml does not default to the Email production init image")
for service in (
    "document_cognition_service",
    "scheduled_action_service",
    "ai_editing_worker",
):
    match = re.search(rf"^  {service}:\n(.*?)(?=^  \w|^volumes:)", compose, re.M | re.S)
    if service in ("document_cognition_service", "scheduled_action_service"):
        if match and 'profiles: ["full"]' in match.group(1):
            fail(f"{service} must be available in the default Email profile")
    elif not match or 'profiles: ["full"]' not in match.group(1):
        fail(f"{service} must stay behind the full Compose profile")

web_assets_match = re.search(r"^  web_assets:\n(.*?)(?=^  \w|^volumes:)", compose, re.M | re.S)
if not web_assets_match:
    fail("web_assets service missing from docker-compose.yml")
else:
    web_assets = web_assets_match.group(1)
    for flag in ("cognition", "scheduledActions", "agents", "docsCollab"):
        expected = "true" if flag in ("cognition", "scheduledActions") else "false"
        if f"{flag}: {expected}" not in web_assets and not (
            flag == "cognition" and "cognition: $${ENABLE_COGNITION:-true}" in web_assets
        ) and not (
            flag == "scheduledActions" and "scheduledActions: $${ENABLE_SCHEDULED_ACTIONS:-true}" in web_assets
        ) and not (
            flag == "scheduledActions" and "scheduledActions: $${ENABLE_SCHEDULED_ACTIONS:-false}" in web_assets
        ) and not (
            flag == "agents" and "agents: $${ENABLE_AGENTS:-false}" in web_assets
        ):
            fail(f"Email profile web runtime config must set FEATURES.{flag} to {expected}")

for image in ("macro-ai-editing-worker", "macro-analytics-proxy"):
    if image in workflow:
        fail(f"{image} must not be built by the Email production image workflow")

# --- FusionAuth / Google IdP contract --------------------------------------
render_kickstart = (SELF_HOST / "init/render-kickstart.sh").read_text()
google_idp_template = (SELF_HOST / "kickstart/idp-google.json.template").read_text()
if 'configured "${GOOGLE_CLIENT_ID:-}" && configured "${GOOGLE_CLIENT_SECRET_KEY:-}"' not in render_kickstart:
    fail("render-kickstart.sh must only render Google IdPs when real credentials are configured")
if "append_requests \"$google\"" not in render_kickstart:
    fail("render-kickstart.sh must append rendered Google IdP requests to kickstart.json")
if '"name": "google"' not in google_idp_template:
    fail("Google sign-in IdP template is missing the google identity provider")
if '"name": "google_gmail"' not in google_idp_template:
    fail("Google Gmail IdP template is missing google_gmail")
if '"lambdaConfiguration": { "reconcileId": "@@RECONCILE_LAMBDA_ID@@" }' not in google_idp_template:
    fail("google_gmail IdP must wire the reconcile lambda")

# --- kafka -----------------------------------------------------------------
# Required Kafka topics for self-host email must exist in self-host/init/kafka-topics.json
topics_src = set(json.loads((ROOT / ".github/kafka-cluster-topics.json").read_text()))
topics_copy = set(json.loads((SELF_HOST / "init/kafka-topics.json").read_text()))

required_email_topics = {
    "macro.email",
    "macro.notifications",
    "macro.channels",
    "macro.chats",
    "macro.documents",
    "macro.properties",
}
missing_email_topics = sorted(required_email_topics - topics_copy)
if missing_email_topics:
    fail(f"self-host/init/kafka-topics.json is missing required email topics: {missing_email_topics}")

# Fictional topics not present in upstream cluster definition should fail
unknown_topics = sorted(topics_copy - topics_src)
if unknown_topics:
    fail(f"self-host/init/kafka-topics.json has unknown topics not in upstream kafka-cluster-topics.json: {unknown_topics}")

# --- CI workflow & action regressions --------------------------------------
# 1. YAML syntax and block scalar indentation regression check
import shutil
import subprocess
yaml_files = [
    str(ROOT / ".github/workflows/self-host-images.yml"),
    str(ROOT / ".github/actions/setup-nix/action.yml"),
]
validated_yaml = False

# Try python yaml (PyYAML) first if available
try:
    import yaml
    for p in yaml_files:
        with open(p, "r") as f:
            yaml.safe_load(f)
    validated_yaml = True
except ImportError:
    pass

# Try bun with js-yaml if bun is present
if not validated_yaml and shutil.which("bun"):
    yaml_check_script = """
    const fs = require('fs');
    const yaml = require('js-yaml');
    for (const p of process.argv.slice(1)) {
      const content = fs.readFileSync(p, 'utf8');
      yaml.load(content);
    }
    """
    res = subprocess.run(
        ["bun", "-e", yaml_check_script, *yaml_files],
        capture_output=True,
        text=True
    )
    if res.returncode == 0:
        validated_yaml = True
    else:
        fail(f"CI YAML syntax/indentation check failed:\n{res.stderr.strip()}")

# Try ruby if available
if not validated_yaml and shutil.which("ruby"):
    ruby_script = 'require "yaml"; ARGV.each { |f| YAML.load_file(f) }'
    res = subprocess.run(
        ["ruby", "-e", ruby_script, *yaml_files],
        capture_output=True,
        text=True
    )
    if res.returncode == 0:
        validated_yaml = True
    else:
        fail(f"CI YAML syntax/indentation check failed:\n{res.stderr.strip()}")

# Try node with js-yaml if node is present
if not validated_yaml and shutil.which("node"):
    node_script = """
    try {
      const fs = require('fs');
      const yaml = require('js-yaml');
      for (const p of process.argv.slice(1)) {
        yaml.load(fs.readFileSync(p, 'utf8'));
      }
      process.exit(0);
    } catch (e) {
      process.exit(1);
    }
    """
    res = subprocess.run(
        ["node", "-e", node_script, *yaml_files],
        capture_output=True,
        text=True
    )
    if res.returncode == 0:
        validated_yaml = True

# 2. Daemon socket protection invariant check
setup_nix_content = (ROOT / ".github/actions/setup-nix/action.yml").read_text()
if "determinate-nixd.service" not in setup_nix_content:
    fail("setup-nix must support determinate-nixd.service for Systemd restarts")

if "rm -f /nix/var/nix/daemon-socket/socket" in setup_nix_content:
    if "if ! sudo test -S /nix/var/nix/daemon-socket/socket; then" not in setup_nix_content:
        fail("setup-nix must guard daemon socket deletion with `if ! sudo test -S /nix/var/nix/daemon-socket/socket`")

if "chmod -R 777 /var/lib/nix-cache-upload" in setup_nix_content:
    fail("setup-nix must not use 0777 permissions for nix cache upload queue; use 0770 with runner group")

if 's3_credentials_file="/etc/nix/s3-cache-credentials"' not in setup_nix_content:
    fail("setup-nix must store private S3 cache credentials in /etc/nix/s3-cache-credentials")

if 'Environment="AWS_SHARED_CREDENTIALS_FILE=$s3_credentials_file"' not in setup_nix_content:
    fail("setup-nix must pass private S3 cache credentials to systemd daemons via a shared credentials file")

if 'Environment="AWS_SECRET_ACCESS_KEY=' in setup_nix_content:
    fail("setup-nix must not write AWS secrets directly into systemd drop-ins")

if "NIX_CACHE_AWS_SESSION_TOKEN" not in setup_nix_content:
    fail("setup-nix must preserve optional AWS_SESSION_TOKEN support for temporary cache credentials")

# 3. Uploader script invariant check
if 'dest="${NIX_CACHE_URL:-}"' not in workflow:
    fail("self-host-images workflow uploader must declare `dest` prior to main loop")

if "Finalize Nix cache uploads\n        if: always()" in workflow:
    fail("self-host-images must not flush streaming Nix cache uploads after failed builds")

# 4. Nix stdenv phase safety check. Phase command snippets execute in the
# shared builder shell, so `set -u` persists into nixpkgs fixup hooks. The
# strip hook intentionally uses optional variables and can fail after every
# service binary compiled successfully if nounset leaks into it.
cloud_storage_nix = (ROOT / "nix/cloud-storage.nix").read_text()
try:
    marker = "# ── Lambda builds"
    if "selfHostEmailBinariesMonolith = craneLib.mkCargoDerivation (" in cloud_storage_nix:
        self_host_email_derivation = cloud_storage_nix.split(
            "selfHostEmailBinariesMonolith = craneLib.mkCargoDerivation (", 1
        )[1].split(marker, 1)[0]
    else:
        self_host_email_derivation = cloud_storage_nix.split(
            "selfHostEmailBinaries = pkgs.buildEnv {", 1
        )[1].split(marker, 1)[0]
except IndexError:
    fail("could not locate selfHostEmailBinaries derivation in nix/cloud-storage.nix")
else:
    unsafe_nounset = re.compile(r"^[ \t]*set[ \t]+-[^\n]*u[^\n]*$", re.M)
    if unsafe_nounset.search(self_host_email_derivation):
        fail(
            "selfHostEmailBinaries must not enable shell nounset in stdenv phases; "
            "it leaks into automatic fixup hooks"
        )

# --- report ----------------------------------------------------------------
if failures:
    print("self-host consistency check failed:\n", file=sys.stderr)
    for f in failures:
        print(f"  - {f}", file=sys.stderr)
    print(f"\n{len(failures)} problem(s).", file=sys.stderr)
    sys.exit(1)

default_email_bins = [b for b in compose_bins if b not in optional_profile_bins]
print(f"self-host email consistency verified: {len(compose_bins)} compose binaries "
      f"({len(default_email_bins)} default email profile, {len(optional_profile_bins)} optional profile), "
      f"localstack_provision wiring verified, {len(topics_copy)} kafka topics")
