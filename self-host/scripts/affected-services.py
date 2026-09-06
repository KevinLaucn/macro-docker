#!/usr/bin/env python3
"""Compute the smallest self-host build set for a Git diff.

The Rust service impact calculation is dependency-aware: a service is rebuilt
only when a changed workspace directory appears in that service package's
transitive workspace closure from .github/workspace-dep-closures.json.

GitHub Actions output:
  run_services=true|false
  service_targets=["self-host-email-email-service", ...]
  run_web=true|false
  run_workers=true|false
  run_init=true|false
  changed_count=N
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLOSURES_PATH = ROOT / ".github/workspace-dep-closures.json"

SERVICE_ROOTS: dict[str, str] = {
    "authentication-service": "authentication_service",
    "connection-gateway": "connection_gateway",
    "contacts-service": "contacts_service",
    "document-storage-service": "document_storage_service",
    "email-service": "email_service",
    "image-proxy-service": "image_proxy_service",
    "notification-service": "notification_service",
    "static-file-service": "static_file_service",
    "unfurl-service": "unfurl_service",
    "search-processing-service": "search_processing_service",
    "upload-finalizer": "document_upload_finalizer_handler",
    "macro-db-migrator": "macro_db_migrator",
}

# These inputs change the derivation graph/toolchain or files copied into every
# pruned Email source. They intentionally invalidate every Email service.
FULL_SERVICE_EXACT = {
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    "flake.nix",
    "flake.lock",
    ".github/workspace-dep-closures.json",
    ".github/workflows/self-host-images.yml",
    "self-host/scripts/affected-services.py",
    "nix/cloud-storage.nix",
    "nix/systems.nix",
}
FULL_SERVICE_PREFIXES = (
    "nix-support/",
    ".cargo/",
    ".github/actions/setup-nix/",
    ".github/actions/teardown-nix/",
    ".sqlx/",
    "static_assets/",
)

SERVICE_IMAGE_EXACT = {
    "self-host/images/Dockerfile.services",
}
SERVICE_IMAGE_PREFIXES = (
    "self-host/images/services/",
)

WEB_EXACT = {
    "package.json",
    "bun.lock",
    "bun.lockb",
    "flake.nix",
    "flake.lock",
    "rust-toolchain.toml",
    ".github/workflows/self-host-images.yml",
    "self-host/scripts/affected-services.py",
    "self-host/images/Dockerfile.web",
}
WEB_PREFIXES = (
    "apps/web/",
    "packages/",
    ".github/actions/setup-nix/",
)

WORKER_EXACT = {
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".github/workflows/self-host-images.yml",
    "self-host/scripts/affected-services.py",
    "docker/websocket-service.Dockerfile",
}
WORKER_PREFIXES = (
    "services/websocket_service/",
)

INIT_EXACT = {
    ".github/kafka-cluster-topics.json",
    "infra/stacks/fusionauth-instance/templates/reconcile_secondary_idp_link.js",
}
INIT_PREFIXES = (
    "self-host/init/",
    "self-host/kickstart/",
    "infra/stacks/opensearch/helpers/",
)


def matches(path: str, exact: set[str], prefixes: tuple[str, ...]) -> bool:
    return path in exact or any(path.startswith(prefix) for prefix in prefixes)


def git_changed_files(base: str, head: str) -> list[str]:
    proc = subprocess.run(
        ["git", "diff", "--name-only", base, head],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def path_in_dir(path: str, directory: str) -> bool:
    return path == directory or path.startswith(directory + "/")


ROOT_SHARED_SUFFIXES = {
    ".md", ".html", ".txt", ".json", ".jsonl", ".toml",
    ".canvas", ".sql", ".sh", ".bop", ".bin",
}


def is_shared_root_dep(path: str) -> bool:
    if "/" in path or path in {"Cargo.toml", "Cargo.lock"}:
        return False
    return pathlib.PurePosixPath(path).suffix in ROOT_SHARED_SUFFIXES


def compute_service_targets(changed: list[str], force_all: bool) -> list[str]:
    if force_all or any(
        matches(path, FULL_SERVICE_EXACT, FULL_SERVICE_PREFIXES)
        or is_shared_root_dep(path)
        for path in changed
    ):
        return [f"self-host-email-{name}" for name in SERVICE_ROOTS]

    closures_doc = json.loads(CLOSURES_PATH.read_text())
    closures: dict[str, list[str]] = closures_doc["closures"]

    affected: list[str] = []
    for service_name, package_name in SERVICE_ROOTS.items():
        service_closure = closures.get(package_name)
        if service_closure is None:
            raise RuntimeError(
                f"{package_name!r} missing from {CLOSURES_PATH.relative_to(ROOT)}"
            )
        if any(
            path_in_dir(path, directory)
            for path in changed
            for directory in service_closure
        ):
            affected.append(f"self-host-email-{service_name}")
    return affected


def write_outputs(values: dict[str, object], output_path: str | None) -> None:
    rendered = {
        key: json.dumps(value, separators=(",", ":"))
        if isinstance(value, (list, dict))
        else str(value).lower()
        if isinstance(value, bool)
        else str(value)
        for key, value in values.items()
    }

    for key, value in rendered.items():
        print(f"{key}={value}")

    if output_path:
        with open(output_path, "a", encoding="utf-8") as fh:
            for key, value in rendered.items():
                fh.write(f"{key}={value}\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--all", action="store_true", dest="force_all")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT"))
    args = parser.parse_args()

    if args.force_all:
        changed: list[str] = []
    else:
        if not args.base:
            parser.error("--base is required unless --all is used")
        changed = git_changed_files(args.base, args.head)

    service_targets = compute_service_targets(changed, args.force_all)

    run_services = args.force_all or bool(service_targets) or any(
        matches(path, SERVICE_IMAGE_EXACT, SERVICE_IMAGE_PREFIXES)
        for path in changed
    )
    run_web = args.force_all or any(
        matches(path, WEB_EXACT, WEB_PREFIXES) for path in changed
    )
    run_workers = args.force_all or any(
        matches(path, WORKER_EXACT, WORKER_PREFIXES)
        or (path.startswith("crates/") and "websocket" in path.lower())
        for path in changed
    )
    run_init = (
        args.force_all
        or "self-host-email-macro-db-migrator" in service_targets
        or any(matches(path, INIT_EXACT, INIT_PREFIXES) for path in changed)
    )

    values = {
        "run_services": run_services,
        "service_targets": service_targets,
        "run_web": run_web,
        "run_workers": run_workers,
        "run_init": run_init,
        "changed_count": len(changed),
    }
    write_outputs(values, args.github_output)

    print("\nChanged files:")
    if changed:
        for path in changed:
            print(f"  {path}")
    else:
        print("  (forced full build)")

    print("\nAffected Email service targets:")
    if service_targets:
        for target in service_targets:
            print(f"  .#{target}")
    else:
        print("  (none)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
