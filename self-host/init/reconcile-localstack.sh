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

        # Self-host extension: heal and sync public SFS avatars from email_sfs_mappings
        python3 - << 'PYEOF' || true
import os, subprocess, urllib.request
from concurrent.futures import ThreadPoolExecutor

db_url = os.environ.get("DATABASE_URL")
endpoint = os.environ.get("AWS_ENDPOINT", "http://localstack:4566")
if not db_url:
    exit(0)

rows = []
try:
    import psycopg2
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT source, destination FROM email_sfs_mappings;")
    rows = cur.fetchall()
    cur.close()
    conn.close()
except Exception:
    try:
        out = subprocess.check_output([
            "psql", db_url, "-t", "-A", "-F", "|||",
            "-c", "SELECT source, destination FROM email_sfs_mappings;"
        ]).decode("utf-8")
        rows = [line.strip().split("|||", 1) for line in out.splitlines() if "|||" in line]
    except Exception:
        rows = []

if not rows:
    exit(0)

try:
    s3_out = subprocess.check_output([
        "aws", "--endpoint-url=" + endpoint, "s3", "ls", "s3://static-file-storage/file/"
    ]).decode("utf-8")
    existing = {parts[-1].strip() for line in s3_out.splitlines() if (parts := line.split())}
except Exception:
    existing = set()

missing = []
for source, dest in rows:
    file_id = dest.rstrip("/").split("/")[-1]
    if file_id not in existing:
        missing.append((source, file_id))

if missing:
    print(f"LocalStack SFS reconciler: healing {len(missing)} missing items...")
    os.makedirs("/tmp/sfs_heal/file", exist_ok=True)
    def download_and_upload(item):
        source, file_id = item
        path = f"/tmp/sfs_heal/file/{file_id}"
        try:
            req = urllib.request.Request(source, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            with open(path, "wb") as f:
                f.write(data)
            subprocess.check_call([
                "aws", "--endpoint-url=" + endpoint, "s3", "cp",
                path, f"s3://static-file-storage/file/{file_id}",
                "--content-type", "image/png"
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            os.remove(path)
        except Exception:
            pass
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(download_and_upload, missing))
    print("LocalStack SFS reconciler: healing completed.")
PYEOF

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
