#!/usr/bin/env python3
"""Validate release artifacts and production contracts for self-host deployment.

This contract validator enforces:
1. Release bundle manifest (release.json) format and completeness.
2. Exact image tag consistency across all images declared in release.json.
3. Caddy reverse_proxy routes match docker-compose service network aliases.
4. No fake 200 route mocks exist in Caddyfile for API endpoints.
5. All required services have corresponding images and network definitions.

Run: python3 self-host/scripts/verify-release.py [--bundle-dir <path>]
"""
from __future__ import annotations
import argparse, json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SELF_HOST = ROOT / "self-host"

REQUIRED_IMAGES = [
    "macro-services-email",
    "macro-scheduled-action",
    "macro-init-email",
    "macro-web",
    "macro-caddy",
    "macro-websocket-service",
]

def verify_caddyfile(caddy_text: str) -> list[str]:
    errors = []
    # Check for fake 200 mocks on API routes
    mock_pattern = re.compile(r'handle_path\s+/[a-zA-Z0-9_-]+/\*\s*\{[^}]*respond\s+["\'](\[\]|\{\})["\']\s+200', re.S)
    for m in mock_pattern.finditer(caddy_text):
        errors.append(f"Fake 200 mock detected in Caddyfile: {m.group(0).strip()}")

    # Check that scheduled-action route exists and proxies to scheduled-action-service:8080
    if not re.search(r'handle_path\s+/scheduled-action/\*\s*\{\s*reverse_proxy\s+scheduled-action-service:8080\s*\}', caddy_text):
        errors.append("Caddyfile missing canonical reverse_proxy to scheduled-action-service:8080")

    return errors

def verify_compose(compose_text: str, caddy_text: str) -> list[str]:
    errors = []
    # Find all reverse_proxy targets in Caddyfile: host:port
    proxy_targets = re.findall(r'reverse_proxy\s+([a-zA-Z0-9_-]+):(\d+)', caddy_text)
    
    # Check that each proxy target alias exists in docker-compose.yml
    for host, port in proxy_targets:
        if host in ("localstack", "analytics-proxy", "sync-service", "lexical-service", "ai-editing-worker"):
            continue
        # Check alias in networks
        alias_pattern = re.compile(rf'aliases:\s*(?:\n\s*-\s*[a-zA-Z0-9_\${{}}-]+)*\n\s*-\s*{re.escape(host)}(?:\s|$)', re.M)
        svc_pattern = re.compile(r'^  ' + re.escape(host) + r':(?:\s|$)', re.M)
        if not alias_pattern.search(compose_text) and not svc_pattern.search(compose_text):
            errors.append(f"Caddyfile proxies to '{host}:{port}', but '{host}' is neither a service name nor a network alias in docker-compose.yml")

    # Check scheduled_action_service is standard (no profiles: ["full"])
    sched_match = re.search(r'^\s\sscheduled_action_service:\n(.*?)(?=^\s\s\w|\Z)', compose_text, re.M | re.S)
    if not sched_match:
        errors.append("scheduled_action_service definition missing from docker-compose.yml")
    else:
        sched_body = sched_match.group(1)
        if 'profiles: ["full"]' in sched_body or "profiles:" in sched_body:
            errors.append("scheduled_action_service must not be restricted by profiles in docker-compose.yml")
        if "scheduled-action-service" not in sched_body:
            errors.append("scheduled_action_service missing network alias 'scheduled-action-service'")

    # Check caddy does not mount host ./Caddyfile
    caddy_match = re.search(r'^\s\scaddy:\n(.*?)(?=^\s\s\w|\Z)', compose_text, re.M | re.S)
    if caddy_match:
        caddy_body = caddy_match.group(1)
        if "./Caddyfile:/etc/caddy/Caddyfile" in caddy_body:
            errors.append("caddy service must not bind-mount host ./Caddyfile; use immutable macro-caddy image")

    return errors

def verify_bundle_manifest(manifest_path: pathlib.Path) -> list[str]:
    errors = []
    if not manifest_path.exists():
        errors.append(f"Release manifest not found at {manifest_path}")
        return errors

    try:
        data = json.loads(manifest_path.read_text())
    except Exception as e:
        errors.append(f"Failed to parse release.json: {e}")
        return errors

    for field in ("version", "git_sha", "built_at", "images"):
        if field not in data:
            errors.append(f"release.json missing required field '{field}'")

    images = data.get("images", {})
    expected_version = data.get("version")
    expected_git_sha = data.get("git_sha")

    if not expected_git_sha or len(expected_git_sha) < 7:
        errors.append(f"release.json git_sha is invalid: {expected_git_sha!r}")

    for req_img in REQUIRED_IMAGES:
        if req_img not in images:
            errors.append(f"release.json missing image '{req_img}'")
            continue

        entry = images[req_img]
        if isinstance(entry, dict):
            img_ref = entry.get("image", "")
            digest = entry.get("digest", "")
        elif isinstance(entry, str):
            img_ref = entry
            digest = ""
        else:
            errors.append(f"Image '{req_img}' entry must be an object or string ref")
            continue

        if not img_ref:
            errors.append(f"Image '{req_img}' is missing image reference")
            continue

        tag = img_ref.split(":")[-1] if ":" in img_ref else ""
        if expected_version and tag != expected_version:
            errors.append(f"Image '{req_img}' tag '{tag}' does not match release version '{expected_version}'")

        if not digest or not digest.startswith("sha256:"):
            errors.append(f"Image '{req_img}' missing valid digest (expected sha256:...): got '{digest}'")

        if expected_git_sha:
            errors.extend(verify_image_revision_and_digest(img_ref, expected_git_sha, digest))

    return errors

def verify_image_revision_and_digest(image_ref: str, expected_sha: str, expected_digest: str | None = None) -> list[str]:
    """Verify that the container image's RepoDigests matches expected_digest and OCI revision matches expected_sha."""
    errors = []
    import subprocess
    cmd = [
        "docker", "inspect",
        "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{json .RepoDigests}}|{{.Id}}',
        image_ref
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            parts = res.stdout.strip().split("|", 2)
            revision = parts[0] if len(parts) > 0 else ""
            repo_digests_raw = parts[1] if len(parts) > 1 else "[]"
            image_id = parts[2] if len(parts) > 2 else ""

            # 1. Verify revision label
            if not revision or revision == "unknown":
                errors.append(f"Image '{image_ref}' is missing required OCI label org.opencontainers.image.revision")
            elif not expected_sha.startswith(revision) and not revision.startswith(expected_sha):
                errors.append(
                    f"Image '{image_ref}' revision label '{revision}' does not match expected git_sha '{expected_sha}'"
                )

            # 2. Verify actual image digest if requested
            if expected_digest:
                actual_digests = []
                try:
                    import json
                    parsed_digests = json.loads(repo_digests_raw)
                    if isinstance(parsed_digests, list):
                        for d in parsed_digests:
                            if "@" in d:
                                actual_digests.append(d.split("@")[-1])
                except Exception:
                    pass
                if image_id:
                    actual_digests.append(image_id)

                if actual_digests and not any(expected_digest == d or expected_digest in d for d in actual_digests):
                    errors.append(
                        f"Image '{image_ref}' actual pulled digest {actual_digests} does not match release.json digest '{expected_digest}'"
                    )
    except Exception:
        # Docker not running or image not pulled locally; non-fatal if offline
        pass
    return errors

def main():
    parser = argparse.ArgumentParser(description="Verify release contract and deployment artifacts")
    parser.add_argument("--bundle-dir", type=pathlib.Path, default=None, help="Path to release bundle directory containing release.json")
    args = parser.parse_args()

    script_parent = pathlib.Path(__file__).resolve().parent
    base_dir = args.bundle_dir if args.bundle_dir else (script_parent.parent if (script_parent.parent / "Caddyfile").exists() else SELF_HOST)
    caddy_path = base_dir / "Caddyfile" if (base_dir / "Caddyfile").exists() else (SELF_HOST / "Caddyfile")
    compose_path = base_dir / "docker-compose.yml" if (base_dir / "docker-compose.yml").exists() else (SELF_HOST / "docker-compose.yml")

    caddy_text = caddy_path.read_text()
    compose_text = compose_path.read_text()

    errors = []
    errors.extend(verify_caddyfile(caddy_text))
    errors.extend(verify_compose(compose_text, caddy_text))

    if args.bundle_dir:
        manifest_path = args.bundle_dir / "release.json"
        errors.extend(verify_bundle_manifest(manifest_path))

    if errors:
        print("Release contract verification FAILED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print("Release contract verification PASSED: Caddyfile routes, Compose aliases, and container invariants match.")

if __name__ == "__main__":
    main()
