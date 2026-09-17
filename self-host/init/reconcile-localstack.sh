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
rm -f /tmp/localstack-ready

while true; do
  if curl -fsS "${ENDPOINT}/_localstack/health" >/dev/null 2>&1; then
    if [ "$prev_state" != "up" ]; then
      echo "LocalStack is healthy (transitioned from ${prev_state}). Reconciling upstream resources via ${PROVISIONER}..."
      if "$PROVISIONER" --url "$ENDPOINT"; then
        echo "LocalStack resources successfully reconciled."
        # Self-host extension: wire search-upload-queue to S3 doc-storage ObjectCreated events
        aws --endpoint-url="$ENDPOINT" sqs create-queue --queue-name search-upload-queue >/dev/null 2>&1 || true
        search_queue_arn="arn:aws:sqs:us-east-1:000000000000:search-upload-queue"
        finalizer_queue_arn="arn:aws:sqs:us-east-1:000000000000:document-upload-finalizer-queue"
        source_arn="arn:aws:s3:::doc-storage"
        search_policy="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"sqs:SendMessage\",\"Resource\":\"$search_queue_arn\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"$source_arn\"}}}]}"
        aws --endpoint-url="$ENDPOINT" sqs set-queue-attributes \
          --queue-url "$ENDPOINT/000000000000/search-upload-queue" \
          --attributes "{\"Policy\":$(echo "$search_policy" | jq -R .)}" >/dev/null 2>&1 || true
        aws --endpoint-url="$ENDPOINT" s3api put-bucket-notification-configuration \
          --bucket doc-storage \
          --notification-configuration "{\"QueueConfigurations\":[{\"Id\":\"document-upload-finalizer\",\"QueueArn\":\"$finalizer_queue_arn\",\"Events\":[\"s3:ObjectCreated:*\"]},{\"Id\":\"document-search-upload\",\"QueueArn\":\"$search_queue_arn\",\"Events\":[\"s3:ObjectCreated:*\"]}]}" >/dev/null 2>&1 || true
        touch /tmp/localstack-ready
        prev_state="up"
      else
        echo "WARNING: localstack_provision failed. Will retry on next check."
        rm -f /tmp/localstack-ready
      fi
    fi
  else
    if [ "$prev_state" = "up" ]; then
      echo "LocalStack transitioned to unhealthy or restarting. Waiting for recovery..."
    fi
    prev_state="down"
    rm -f /tmp/localstack-ready
  fi
  sleep "$INTERVAL"
done
