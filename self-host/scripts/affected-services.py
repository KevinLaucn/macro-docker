#!/usr/bin/env python3
"""Compute the smallest self-host build set for a Git diff.

The Rust service impact calculation is dependency-aware: a service is rebuilt
only when a changed workspace directory appears in that service package's
transitive workspace closure from .github/workspace-dep-closures.json.

The script fails closed when its hard-coded production service inventory drifts
from nix/cloud-storage.nix, so a future service addition cannot silently skip
CI rebuilds.

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
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLOSURES_PATH = ROOT / ".github/workspace-dep-closures.json"
NIX_PATH = ROOT / "nix/cloud-storage.nix"

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

ROOT_SHARED_SUFFIXES = {
    ".md",
    ".html",
    ".txt",
    ".json",
    ".jsonl",
    ".toml",
    ".canvas",
    ".sql",
    ".sh",
    ".bop",
    ".bin",
}


def matches(path: str, exact: set[str], prefixes: tuple[str, ...]) -> bool:
    return path in exact or any(path.startswith(prefix) for prefix in prefixes)


def git_changed_files(base: str, head: str) -> list[str]:
    # --no-renames is deliberate. A rename crossing service boundaries must
    # expose both the deleted old path and the added new path, otherwise the
    # service losing the file could be incorrectly treated as unaffected.
    proc = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", base, head],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def path_in_dir(path: str, directory: str) -> bool:
    return path == directory or path.startswith(directory + "/")


def is_shared_root_dep(path: str) -> bool:
    # Mirrors rootDepsSrc in nix/cloud-storage.nix: top-level shared asset files
    # become inputs to every pruned Email service source.
    if "/" in path or path in {"Cargo.toml", "Cargo.lock"}:
        return False
    return pathlib.PurePosixPath(path).suffix in ROOT_SHARED_SUFFIXES


def load_closures() -> dict[str, list[str]]:
    doc = json.loads(CLOSURES_PATH.read_text(encoding="utf-8"))
    closures = doc.get("closures")
    if not isinstance(closures, dict):
        raise RuntimeError(f"{CLOSURES_PATH.relative_to(ROOT)} has no closures object")
    return closures


def nix_email_definitions() -> dict[str, str]:
    """Read the simple serviceName/packageName pairs from the Email Nix list.

    This is intentionally only a drift guard, not a general Nix parser. If the
    Nix block is refactored enough that this parser no longer matches, CI fails
    closed and asks for this planner to be updated instead of silently skipping
    a production service.
    """
    text = NIX_PATH.read_text(encoding="utf-8")
    start_marker = "selfHostEmailBinaryDefinitions = ["
    end_marker = "      ];"
    try:
        block = text.split(start_marker, 1)[1].split(end_marker, 1)[0]
    except IndexError as exc:
        raise RuntimeError(
            "could not locate selfHostEmailBinaryDefinitions in nix/cloud-storage.nix"
        ) from exc

    pairs = re.findall(
        r'serviceName\s*=\s*"([^"]+)";\s*\n\s*packageName\s*=\s*"([^"]+)";',
        block,
    )
    if not pairs:
        raise RuntimeError(
            "could not parse any Email service definitions from nix/cloud-storage.nix"
        )
    return dict(pairs)


def validate_config(closures: dict[str, list[str]]) -> None:
    nix_defs = nix_email_definitions()
    if nix_defs != SERVICE_ROOTS:
        missing = sorted(set(nix_defs) - set(SERVICE_ROOTS))
        extra = sorted(set(SERVICE_ROOTS) - set(nix_defs))
        mismatched = sorted(
            name
            for name in set(nix_defs) & set(SERVICE_ROOTS)
            if nix_defs[name] != SERVICE_ROOTS[name]
        )
        raise RuntimeError(
            "affected-services.py service inventory drifted from "
            "selfHostEmailBinaryDefinitions; "
            f"missing={missing}, extra={extra}, package_mismatch={mismatched}"
        )

    missing_closures = sorted(
        package for package in SERVICE_ROOTS.values() if package not in closures
    )
    if missing_closures:
        raise RuntimeError(
            ".github/workspace-dep-closures.json is missing production packages: "
            + ", ".join(missing_closures)
        )


def changed_path_hits_closure(
    path: str,
    package_name: str,
    closures: dict[str, list[str]],
) -> bool:
    package_closure = closures.get(package_name)
    if package_closure is None:
        return False
    return any(path_in_dir(path, directory) for directory in package_closure)


def compute_service_targets(
    changed: list[str],
    force_all: bool,
    closures: dict[str, list[str]],
) -> list[str]:
    if force_all or any(
        matches(path, FULL_SERVICE_EXACT, FULL_SERVICE_PREFIXES)
        or is_shared_root_dep(path)
        for path in changed
    ):
        return [f"self-host-email-{name}" for name in SERVICE_ROOTS]

    affected: list[str] = []
    for service_name, package_name in SERVICE_ROOTS.items():
        if any(
            changed_path_hits_closure(path, package_name, closures)
            for path in changed
        ):
            affected.append(f"self-host-email-{service_name}")
    return affected


def worker_is_affected(
    changed: list[str],
    force_all: bool,
    closures: dict[str, list[str]],
) -> bool:
    if force_all:
        return True
    if any(matches(path, WORKER_EXACT, WORKER_PREFIXES) for path in changed):
        return True

    websocket_closure = closures.get("websocket_service")
    if websocket_closure is not None:
        return any(
            path_in_dir(path, directory)
            for path in changed
            for directory in websocket_closure
        )

    # Fail safe if the generated closure does not expose websocket_service.
    # This is intentionally conservative rather than risking a stale worker.
    return any(
        path.startswith("crates/") or path.startswith("services/websocket_service/")
        for path in changed
    )


def compute_impact(
    changed: list[str],
    force_all: bool,
    closures: dict[str, list[str]],
) -> dict[str, object]:
    service_targets = compute_service_targets(changed, force_all, closures)

    run_services = force_all or bool(service_targets) or any(
        matches(path, SERVICE_IMAGE_EXACT, SERVICE_IMAGE_PREFIXES)
        for path in changed
    )
    run_web = force_all or any(
        matches(path, WEB_EXACT, WEB_PREFIXES) for path in changed
    )
    run_workers = worker_is_affected(changed, force_all, closures)
    run_init = (
        force_all
        or "self-host-email-macro-db-migrator" in service_targets
        or any(matches(path, INIT_EXACT, INIT_PREFIXES) for path in changed)
    )

    return {
        "run_services": run_services,
        "service_targets": service_targets,
        "run_web": run_web,
        "run_workers": run_workers,
        "run_init": run_init,
        "changed_count": len(changed),
    }


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

    closures = load_closures()
    validate_config(closures)

    if args.force_all:
        changed: list[str] = []
    else:
        if not args.base:
            parser.error("--base is required unless --all is used")
        changed = git_changed_files(args.base, args.head)

    values = compute_impact(changed, args.force_all, closures)
    write_outputs(values, args.github_output)

    print("\nChanged files:")
    if changed:
        for path in changed:
            print(f"  {path}")
    else:
        print("  (forced full build)" if args.force_all else "  (none)")

    print("\nAffected Email service targets:")
    service_targets = values["service_targets"]
    if isinstance(service_targets, list) and service_targets:
        for target in service_targets:
            print(f"  .#{target}")
    else:
        print("  (none)")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"affected-services: {exc}", file=sys.stderr)
        sys.exit(2)
