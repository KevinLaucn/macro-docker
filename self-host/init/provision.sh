#!/usr/bin/env bash
# Provision everything the stack needs before the services start.
#
# Idempotent by design: it runs on every `macroctl up`, and every step is a
# create-if-absent. Safe to re-run against a live deployment.
set -euo pipefail

AWS_ENDPOINT="${LOCAL_AWS_URL:-http://localstack:4566}"
MANIFEST=/app/resources.json
KAFKA_TOPICS=/app/kafka-topics.json

aws_() { aws --endpoint-url "$AWS_ENDPOINT" --region "${AWS_REGION:-us-east-1}" "$@"; }
log()  { printf '  %s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

# Treat "it already exists" as success, fail on anything else.
tolerate_exists() {
  local what="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    return 0
  fi
  case "$out" in
    *AlreadyExists*|*ResourceInUseException*|*BucketAlreadyOwnedByYou*|*QueueNameExists*|*QueueAlreadyExists*)
      return 0 ;;
    *)
      printf 'creating %s failed:\n%s\n' "$what" "$out" >&2
      return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
step "Waiting for dependencies"
# ---------------------------------------------------------------------------
wait_for() {
  local name="$1" ; shift
  local tries=60
  until "$@" >/dev/null 2>&1; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "timed out waiting for $name" >&2
      exit 1
    fi
    sleep 2
  done
  log "$name ready"
}

PGHOST=$(printf '%s' "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
PGPORT=$(printf '%s' "$DATABASE_URL" | sed -E 's|.*@[^:]+:([0-9]+).*|\1|')
PGUSER=$(printf '%s' "$DATABASE_URL" | sed -E 's|postgres(ql)?://([^:]+):.*|\2|')
PGDATABASE=$(printf '%s' "$DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')
export PGPASSWORD
PGPASSWORD=$(printf '%s' "$DATABASE_URL" | sed -E 's|postgres(ql)?://[^:]+:([^@]+)@.*|\2|')

wait_for postgres pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER"
wait_for localstack curl -fsS "$AWS_ENDPOINT/_localstack/health"
wait_for opensearch curl -fsS "${OPENSEARCH_URL:-http://search:9200}/_cluster/health"

# ---------------------------------------------------------------------------
step "Database"
# ---------------------------------------------------------------------------
if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q 1; then
  log "database $PGDATABASE exists"
else
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$PGDATABASE\"" >/dev/null
  log "created database $PGDATABASE"
fi

log "applying migrations"
macro_db_migrate

if [ -n "${ADMIN_EMAIL:-}" ]; then
  log "ensuring Super Administrator exists ($ADMIN_EMAIL)"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -v admin_email="$ADMIN_EMAIL" <<'ADMIN_EOF' >/dev/null
SET macro.admin_email = :'admin_email';
DO $$
DECLARE
  v_admin_email text := lower(current_setting('macro.admin_email'));
  v_user_id uuid;
BEGIN
  -- 1. Look up existing real user UUID for admin_email
  SELECT "macro_user_id" INTO v_user_id FROM "User"
  WHERE lower("email") = v_admin_email AND "macro_user_id" IS NOT NULL AND "macro_user_id" != '00000000-0000-0000-0000-000000000001'::uuid
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT "id" INTO v_user_id FROM "macro_user"
    WHERE lower("email") = v_admin_email AND "id" != '00000000-0000-0000-0000-000000000001'::uuid
    LIMIT 1;
  END IF;

  -- 2. If no user exists yet, initialize placeholder; if already exists with a real UUID, never overwrite it!
  IF v_user_id IS NULL THEN
    v_user_id := '00000000-0000-0000-0000-000000000001'::uuid;

    INSERT INTO "macro_user" ("id", "username", "email", "stripe_customer_id", "has_trialed")
    VALUES (v_user_id, 'admin', v_admin_email, 'cus_local_admin', true)
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "User" ("id", "email", "name", "macro_user_id", "aiDataConsent", "tutorialComplete")
    VALUES ('macro|' || v_admin_email, v_admin_email, 'Admin', v_user_id, true, true)
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  -- 3. Ensure Super Administrator roles are granted
  INSERT INTO "RolesOnUsers" ("userId", "roleId")
  VALUES
    ('macro|' || v_admin_email, 'super_admin'),
    ('macro|' || v_admin_email, 'ai_subscriber'),
    ('macro|' || v_admin_email, 'sub_opus'),
    ('macro|' || v_admin_email, 'editor_user'),
    ('macro|' || v_admin_email, 'email_tool'),
    ('macro|' || v_admin_email, 'professional_subscriber')
  ON CONFLICT ("userId", "roleId") DO NOTHING;
END $$;
ADMIN_EOF
fi

# ---------------------------------------------------------------------------
step "Object storage"
# ---------------------------------------------------------------------------
CORS='{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","POST","DELETE","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}'
while read -r bucket; do
  tolerate_exists "bucket $bucket" aws_ s3api create-bucket --bucket "$bucket"
  aws_ s3api put-bucket-cors --bucket "$bucket" --cors-configuration "$CORS"
  log "bucket $bucket"
done < <(jq -r '.buckets[].name' "$MANIFEST")

# ---------------------------------------------------------------------------
step "Queues"
# ---------------------------------------------------------------------------
while read -r queue; do
  case "$queue" in
    *.fifo) tolerate_exists "queue $queue" aws_ sqs create-queue --queue-name "$queue" --attributes FifoQueue=true ;;
    *)      tolerate_exists "queue $queue" aws_ sqs create-queue --queue-name "$queue" ;;
  esac
  log "queue $queue"
done < <(jq -r '.queues[].name' "$MANIFEST")

# ---------------------------------------------------------------------------
step "Tables"
# ---------------------------------------------------------------------------
# Schemas mirror tooling/xtask/crates/xtask_local/src/local/localstack.rs.
tolerate_exists "table bulk-upload" aws_ dynamodb create-table \
  --table-name bulk-upload \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"DocumentPkIndex","KeySchema":[{"AttributeName":"SK","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'
log "table bulk-upload"

tolerate_exists "table connection-gateway-table" aws_ dynamodb create-table \
  --table-name connection-gateway-table \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"ConnectionPkIndex","KeySchema":[{"AttributeName":"SK","KeyType":"HASH"},{"AttributeName":"PK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'
log "table connection-gateway-table"

tolerate_exists "table static-file-metadata" aws_ dynamodb create-table \
  --table-name static-file-metadata \
  --attribute-definitions AttributeName=file_id,AttributeType=S \
  --key-schema AttributeName=file_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
log "table static-file-metadata"

# ---------------------------------------------------------------------------
step "Encryption key"
# ---------------------------------------------------------------------------
# Users' Cursor API keys are encrypted under this CMK. Check the alias before
# creating: CreateKey always succeeds and always mints a new key, so an
# unconditional call would orphan one key per run — and rows encrypted under
# the previous key would become permanently undecryptable.
KMS_ALIAS=$(jq -r '.kms_alias' "$MANIFEST")
if aws_ kms list-aliases | jq -e --arg a "$KMS_ALIAS" '.Aliases[]? | select(.AliasName == $a)' >/dev/null; then
  log "kms alias $KMS_ALIAS exists"
else
  KEY_ID=$(aws_ kms create-key --description "Macro self-host Cursor API key CMK" | jq -r '.KeyMetadata.KeyId')
  aws_ kms create-alias --alias-name "$KMS_ALIAS" --target-key-id "$KEY_ID"
  log "created kms alias $KMS_ALIAS -> $KEY_ID"
fi

# ---------------------------------------------------------------------------
step "Upload finalizer wiring"
# ---------------------------------------------------------------------------
ACCOUNT_ID=$(jq -r '.account_id' "$MANIFEST")
FINALIZER_QUEUE=document-upload-finalizer-queue
DOC_BUCKET=doc-storage
QUEUE_URL="$AWS_ENDPOINT/$ACCOUNT_ID/$FINALIZER_QUEUE"
QUEUE_ARN="arn:aws:sqs:${AWS_REGION:-us-east-1}:$ACCOUNT_ID:$FINALIZER_QUEUE"
SOURCE_ARN="arn:aws:s3:::$DOC_BUCKET"

POLICY=$(jq -nc --arg qarn "$QUEUE_ARN" --arg sarn "$SOURCE_ARN" '{
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow", Principal: "*", Action: "sqs:SendMessage", Resource: $qarn,
    Condition: { ArnEquals: { "aws:SourceArn": $sarn } }
  }]
}')
aws_ sqs set-queue-attributes --queue-url "$QUEUE_URL" \
  --attributes "$(jq -nc --arg p "$POLICY" '{Policy: $p}')"

aws_ s3api put-bucket-notification-configuration --bucket "$DOC_BUCKET" \
  --notification-configuration "$(jq -nc --arg arn "$QUEUE_ARN" '{
    QueueConfigurations: [{ Id: "document-upload-finalizer", QueueArn: $arn, Events: ["s3:ObjectCreated:*"] }]
  }')"
log "doc-storage ObjectCreated -> $FINALIZER_QUEUE"

# ---------------------------------------------------------------------------
step "Search indices"
# ---------------------------------------------------------------------------
# The mappings live in the TypeScript infra helpers, which are the canonical,
# test-guarded source. Running them here rather than copying the mapping bodies
# is what keeps a self-hosted cluster's schema identical to the hosted one.
cd /app/opensearch-helpers
ENVIRONMENT=local \
DRY_RUN=false \
OPENSEARCH_URL="${OPENSEARCH_URL:-http://search:9200}" \
OPENSEARCH_USERNAME="${OPENSEARCH_USERNAME:-macro}" \
OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-macro}" \
  bun run scripts/create_indices.ts
cd /app

printf '\n==> Provisioning complete.\n'
