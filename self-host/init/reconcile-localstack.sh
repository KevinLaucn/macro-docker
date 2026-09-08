#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT:-http://localstack:4566}"
INTERVAL="${POLL_INTERVAL_SECONDS:-5}"

PROVISIONER="localstack_provision"
if ! command -v "$PROVISIONER" >/dev/null 2>&1; then
  if [ -x /usr/local/bin/localstack_provision ]; then
    PROVISIONER="/usr/local/bin/localstack_provision"
  elif [ -x /app/out/localstack_provision ]; then
    PROVISIONER="/app/out/localstack_provision"
  else
    echo "ERROR: localstack_provision binary not found!" >&2
    exit 1
  fi
fi

echo "Starting LocalStack reconciler sidecar watching ${ENDPOINT} (poll interval: ${INTERVAL}s)..."

prev_state="down"

while true; do
  if curl -fsS "${ENDPOINT}/_localstack/health" >/dev/null 2>&1; then
    if [ "$prev_state" != "up" ]; then
      echo "LocalStack is healthy (transitioned from ${prev_state}). Reconciling upstream resources via ${PROVISIONER}..."
      if "$PROVISIONER" --url "$ENDPOINT"; then
        echo "LocalStack resources successfully reconciled."
        prev_state="up"
      else
        echo "WARNING: localstack_provision failed. Will retry on next check."
      fi
    fi
  else
    if [ "$prev_state" = "up" ]; then
      echo "LocalStack transitioned to unhealthy or restarting. Waiting for recovery..."
    fi
    prev_state="down"
  fi
  sleep "$INTERVAL"
done
