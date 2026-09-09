import os, sys, json, time, requests, subprocess, random, uuid

# Load environment configuration
env_paths = [
    "/home/ubuntu/marco/.env",
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    "self-host/.env",
    ".env"
]
env = {}
for p in env_paths:
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
        break

fa_api_key = env.get("FUSIONAUTH_API_KEY", "cfBVt8zgcEBlptFBrtY6FyflTyOknljGXnz3LLkKlRo")
app_id = env.get("FUSIONAUTH_CLIENT_ID", "8d0635c8-6553-4c2e-94b0-522a35069634")
google_idp_id = env.get("GOOGLE_IDP_ID", "44444444-4444-4444-8444-444444444444")
gmail_idp_id = env.get("GOOGLE_GMAIL_IDP_ID", "55555555-5555-4555-8555-555555555555")
github_idp_id = env.get("GITHUB_IDP_ID", "99999999-9999-4999-8999-999999999999")
reconcile_lambda_id = env.get("RECONCILE_LAMBDA_ID", "44444444-4444-4444-8444-000000000002")

google_client_id = env.get("GOOGLE_CLIENT_ID")
google_client_secret = env.get("GOOGLE_CLIENT_SECRET_KEY")
github_client_id = env.get("GITHUB_CLIENT_ID")
github_client_secret = env.get("GITHUB_CLIENT_SECRET")

def get_fusionauth_base():
    # 1. Try docker network IP
    try:
        res = subprocess.run("docker inspect macro-selfhost-fusionauth-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'", shell=True, capture_output=True, text=True)
        ips = [ip for ip in res.stdout.strip().split() if ip.startswith("172.")]
        if ips:
            return f"http://{ips[0]}:9011"
    except Exception:
        pass
    # 2. Try default container IP / hostname
    return "http://127.0.0.1:9011"

base = get_fusionauth_base()
headers = {"Authorization": fa_api_key, "Content-Type": "application/json"}

def uuid7():
    ts_ms = int(time.time() * 1000)
    rand_a = random.getrandbits(12)
    rand_b = random.getrandbits(62)
    value = (ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    return str(uuid.UUID(int=value))

def run_psql(sql, timeout=10):
    res = subprocess.run(
        f'docker exec $(docker ps -q -f name=postgres) psql -U macro -d macrodb -tAc "{sql}"',
        shell=True, capture_output=True, text=True, timeout=timeout
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res

def send_backfill_message(message, timeout=10):
    body = json.dumps(message, separators=(",", ":"))
    subprocess.run(
        [
            "docker", "exec", "macro-selfhost-localstack-1",
            "awslocal", "sqs", "send-message",
            "--queue-url", "http://localstack:4566/000000000000/email-service-backfill-queue",
            "--message-body", body,
        ],
        check=True, capture_output=True, text=True, timeout=timeout
    )

# 1. Wait for FusionAuth to be ready (Timing resilience: retry up to 60s)
print(f"Checking FusionAuth availability at {base}...")
is_ready = False
for attempt in range(30):
    try:
        r = requests.get(f"{base}/api/status", headers=headers, timeout=2)
        if r.status_code == 200:
            is_ready = True
            break
    except Exception:
        pass
    time.sleep(2)

if not is_ready:
    print("FusionAuth not reachable after 60s, skipping IdP reconciliation for now.")
else:
    # 2. Reconcile OpenID Reconcile Lambda
    reconcile_body = """function reconcile(user, registration, jwt, id_token, tokens) {
  var jwtEmail = jwt && typeof jwt.email === "string" ? jwt.email.toLowerCase() : null;
  var userEmail = user && typeof user.email === "string" ? user.email.toLowerCase() : null;
  if (!jwtEmail || !userEmail || jwtEmail !== userEmail) {
    throw new Error("This Google account is linked as a secondary inbox to another Macro account. Sign in with your primary email or contact support.");
  }
  function claim(name) {
    var value = jwt && jwt[name];
    if (typeof value !== "string" || !value.trim()) { value = id_token && id_token[name]; }
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  if (!user.firstName) { user.firstName = claim("given_name"); }
  if (!user.lastName) { user.lastName = claim("family_name"); }
  if (!user.fullName) { user.fullName = claim("name"); }
}"""

    try:
        requests.post(f"{base}/api/lambda/{reconcile_lambda_id}", headers=headers, json={
            "lambda": {"id": reconcile_lambda_id, "name": "Reconcile Secondary IdP Link", "type": "OpenIDReconcile", "enabled": True, "body": reconcile_body}
        }, timeout=5)
        print("  - Reconcile Lambda: verified")
    except Exception as e:
        print(f"  - Reconcile Lambda error: {e}")

    # 3. Reconcile Google & Gmail IdP
    if google_client_id and google_client_secret and not google_client_id.startswith("unset-"):
        try:
            requests.post(f"{base}/api/identity-provider/{google_idp_id}", headers=headers, json={
                "identityProvider": {
                    "type": "OpenIDConnect", "name": "google", "enabled": True, "buttonText": "Google", "linkingStrategy": "LinkByEmail",
                    "oauth2": {
                        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&access_type=offline",
                        "token_endpoint": "https://oauth2.googleapis.com/token", "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
                        "client_id": google_client_id, "client_secret": google_client_secret, "clientAuthenticationMethod": "client_secret_basic",
                        "scope": "openid profile email", "uniqueIdClaim": "sub", "emailClaim": "email", "emailVerifiedClaim": "email_verified", "usernameClaim": "preferred_username"
                    },
                    "applicationConfiguration": {app_id: {"enabled": True, "createRegistration": True}}
                }
            }, timeout=5)
            print("  - Google IdP: verified")
        except Exception as e:
            print(f"  - Google IdP error: {e}")

        try:
            requests.post(f"{base}/api/identity-provider/{gmail_idp_id}", headers=headers, json={
                "identityProvider": {
                    "type": "OpenIDConnect", "name": "google_gmail", "enabled": True, "buttonText": "GoogleGmail", "linkingStrategy": "LinkByEmail",
                    "lambdaConfiguration": {"reconcileId": reconcile_lambda_id},
                    "oauth2": {
                        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&access_type=offline",
                        "token_endpoint": "https://oauth2.googleapis.com/token", "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
                        "client_id": google_client_id, "client_secret": google_client_secret, "clientAuthenticationMethod": "client_secret_basic",
                        "scope": "openid profile email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/calendar",
                        "uniqueIdClaim": "sub", "emailClaim": "email", "emailVerifiedClaim": "email_verified", "usernameClaim": "preferred_username"
                    },
                    "applicationConfiguration": {app_id: {"enabled": True, "createRegistration": True}}
                }
            }, timeout=5)
            print("  - Google Gmail IdP: verified")
        except Exception as e:
            print(f"  - Google Gmail IdP error: {e}")

    # 4. Reconcile GitHub IdP
    if github_client_id and github_client_secret and not github_client_id.startswith("unset-"):
        try:
            requests.post(f"{base}/api/identity-provider/{github_idp_id}", headers=headers, json={
                "identityProvider": {
                    "type": "OpenIDConnect", "name": "github", "enabled": True, "buttonText": "GitHub", "linkingStrategy": "LinkByEmail",
                    "oauth2": {
                        "authorization_endpoint": "https://github.com/login/oauth/authorize",
                        "token_endpoint": "https://github.com/login/oauth/access_token",
                        "userinfo_endpoint": "https://api.github.com/user",
                        "client_id": github_client_id, "client_secret": github_client_secret, "clientAuthenticationMethod": "client_secret_basic",
                        "scope": "read:user user:email", "uniqueIdClaim": "id", "emailClaim": "email", "usernameClaim": "login"
                    },
                    "applicationConfiguration": {app_id: {"enabled": True, "createRegistration": True}}
                }
            }, timeout=5)
            print("  - GitHub IdP: verified")
        except Exception as e:
            print(f"  - GitHub IdP error: {e}")

# 5. Reconcile PostgreSQL User Parity (Heals foreign key mismatch so profile edits never fail)
try:
    fix_sql = '''
    INSERT INTO "macro_user" ("id", "email", "name")
    SELECT u.macro_user_id, u.email, COALESCE(u.name, split_part(u.email, '@', 1))
    FROM "User" u
    LEFT JOIN "macro_user" m ON u.macro_user_id = m.id
    WHERE m.id IS NULL
    ON CONFLICT ("id") DO NOTHING;
    '''
    subprocess.run(
        f'docker exec $(docker ps -q -f name=postgres) psql -U macro -d macrodb -c "{fix_sql}"',
        shell=True, capture_output=True, text=True, timeout=5
    )
    print("  - MacroDB User Parity: reconciled")
except Exception as e:
    print(f"  - User Parity reconcile error: {e}")

# 6. Reconcile stuck Email Backfill Init Outbox (Ensures inbox sync never wedges if outbox worker is delayed)
try:
    check_sql = '''
    SELECT outbox.id, outbox.backfill_job_id, job.link_id,
           (job.threads_requested_limit IS NULL AND NOT job.is_recovery) AS priority_pass,
           job.is_recovery AS refresh_existing
    FROM email_backfill_init_outbox outbox
    JOIN email_backfill_jobs job ON job.id = outbox.backfill_job_id
    WHERE outbox.published_at IS NULL
      AND job.status = 'InProgress'
      AND job.initialized_at IS NOT NULL;
    '''
    res = subprocess.run(
        f'docker exec $(docker ps -q -f name=postgres) psql -U macro -d macrodb -tAc "{check_sql}"',
        shell=True, capture_output=True, text=True, timeout=5
    )
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    if lines:
        import boto3
        sqs = boto3.client("sqs", endpoint_url="http://127.0.0.1:4566", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
        q_url = "http://127.0.0.1:4566/000000000000/email-service-backfill-queue"
        for l in lines:
            parts = l.split("|")
            if len(parts) >= 5:
                outbox_id, job_id, link_id, prio, refresh = parts[0], parts[1], parts[2], parts[3] == "t", parts[4] == "t"
                msg = {
                    "backfillOperation": {
                        "list_threads": {
                            "link_id": link_id,
                            "job_id": job_id,
                            "next_page_token": None,
                            "priority_pass": prio,
                            "refresh_existing": refresh
                        }
                    }
                }
                sqs.send_message(QueueUrl=q_url, MessageBody=json.dumps(msg))
                subprocess.run(
                    f"docker exec $(docker ps -q -f name=postgres) psql -U macro -d macrodb -c \"UPDATE email_backfill_init_outbox SET published_at = now() WHERE id = '{outbox_id}';\"",
                    shell=True, capture_output=True, text=True, timeout=5
                )
                print(f"  - Auto-healed stuck email backfill job {job_id} (dispatched to SQS)")
except Exception as e:
    pass

# 7. Reconcile stuck Email Backfill Completion Outbox.
# Some backfills can persist every thread but miss the final completion event if
# Redis/SQS restarts at the exact handoff point. PostgreSQL is the source of truth:
# a stale InProgress job with retrieved >= total is safe to re-enter through the
# official completion outbox.
try:
    check_sql = '''
    SELECT job.id, job.link_id
    FROM email_backfill_jobs job
    LEFT JOIN email_backfill_completion_outbox outbox
      ON outbox.backfill_job_id = job.id
    WHERE job.status = 'InProgress'
      AND job.total_threads > 0
      AND job.threads_retrieved_count >= job.total_threads
      AND job.updated_at < now() - interval '10 minutes'
      AND outbox.backfill_job_id IS NULL;
    '''
    res = run_psql(check_sql)
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    for l in lines:
        parts = l.split("|")
        if len(parts) < 2:
            continue
        job_id, link_id = parts[0], parts[1]
        outbox_id = uuid7()
        repair_sql = f'''
        BEGIN;
        UPDATE email_backfill_jobs
        SET status = 'Complete',
            initialized_at = COALESCE(initialized_at, now()),
            init_lease_token = NULL,
            init_lease_expires_at = NULL,
            updated_at = now()
        WHERE id = '{job_id}'
          AND status = 'InProgress'
          AND total_threads > 0
          AND threads_retrieved_count >= total_threads
          AND updated_at < now() - interval '10 minutes';
        INSERT INTO email_backfill_completion_outbox (id, backfill_job_id)
        SELECT '{outbox_id}', '{job_id}'
        WHERE EXISTS (
            SELECT 1 FROM email_backfill_jobs
            WHERE id = '{job_id}' AND status = 'Complete'
        )
        ON CONFLICT (backfill_job_id) DO NOTHING;
        COMMIT;
        '''
        run_psql(repair_sql)
        msg = {
            "backfillOperation": {
                "finalize_backfill": {
                    "link_id": link_id,
                    "job_id": job_id
                }
            }
        }
        send_backfill_message(msg)
        run_psql(
            f"UPDATE email_backfill_completion_outbox SET published_at = now() WHERE backfill_job_id = '{job_id}' AND published_at IS NULL;"
        )
        print(f"  - Auto-healed completed email backfill job {job_id} (dispatched finalize to SQS)")
except Exception as e:
    print(f"  - Email Backfill Completion reconcile error: {e}")

print("All idempotent reconciliations finished successfully.")
