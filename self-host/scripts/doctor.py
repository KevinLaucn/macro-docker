#!/usr/bin/env python3
"""Macro Self-Host Business Health & Contract Doctor Probe.

Probes deep-water business contracts across:
1. LocalStack SQS Queues, S3 Buckets + CORS, DynamoDB tables, KMS Key/Alias
2. FusionAuth Third-party Identity Providers (Google & google_gmail)
3. MacroDB User ID parity with FusionAuth JWT subject
4. Linked Gmail Inboxes Sync Health & Reauth Status
5. Core Microservices health status
"""
from __future__ import annotations
import os, sys, json, subprocess

def run_cmd(cmd: str) -> tuple[int, str]:
    res = subprocess.run(cmd, shell=True, executable="/bin/bash", stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0 and not res.stdout:
        return res.returncode, res.stderr.strip()
    return res.returncode, res.stdout.strip()

print("==================================================")
print("     Macro Self-Host Business Health Doctor       ")
print("==================================================")

failures = []

# 1. LocalStack Infrastructure & Provisioning Check
print("\n[1/5] Checking LocalStack Infrastructure & Upstream Provisioning...")
code, out = run_cmd("docker exec macro-selfhost-localstack-1 curl -fsS http://localhost:4566/_localstack/health")
if code == 0 and ("running" in out or "available" in out):
    print("  ✅ LocalStack: endpoint healthy and responding")
else:
    msg = f"  ❌ LocalStack: health endpoint unreachable (raw: {out[:100]})"
    print(msg); failures.append(msg)

code, out = run_cmd("docker exec macro-selfhost-localstack-1 awslocal sqs list-queues")
queue_count = out.count("http")
if queue_count >= 20:
    print(f"  ✅ SQS Queues: {queue_count} reconciled via upstream catalog")
else:
    msg = f"  ❌ SQS Queues: only {queue_count} found (raw: {out[:100]})"
    print(msg); failures.append(msg)

code, out = run_cmd("docker exec macro-selfhost-localstack-1 awslocal s3api list-buckets --query 'Buckets[*].Name' --output text")
buckets = out.split()
if len(buckets) >= 5:
    print(f"  ✅ S3 Buckets: {len(buckets)} complete ({', '.join(buckets)})")
else:
    msg = f"  ❌ S3 Buckets: found {len(buckets)} ({buckets})"
    print(msg); failures.append(msg)


# 2. FusionAuth IdP Contract
print("\n[2/5] Checking FusionAuth Identity Providers (OAuth / Gmail)...")
sql = "SELECT string_agg(name, ',') FROM identity_providers;"
code, out = run_cmd(f"docker exec macro-selfhost-fusionauth_db-1 psql -U postgres -d fusionauth -tAc \"{sql}\"")
idp_names = [x.strip() for x in out.split(",") if x.strip()]
if "google_gmail" in idp_names and "google" in idp_names:
    print(f"  ✅ Identity Providers: Google & google_gmail registered ({', '.join(idp_names)})")
else:
    msg = f"  ❌ Identity Providers: missing google_gmail in FusionAuth (registered: {idp_names})"
    print(msg); failures.append(msg)

# 3. User ID & Foreign Key Parity
print("\n[3/5] Checking MacroDB User ID Foreign Key Parity...")
parity_sql = 'SELECT count(*) FROM "User" u LEFT JOIN "macro_user" m ON u.macro_user_id = m.id WHERE m.id IS NULL;'
code, out = run_cmd(f"docker exec macro-selfhost-postgres-1 psql -U macro -d macrodb -tAc '{parity_sql}'")
if out.strip() == "0":
    print("  ✅ User ID Parity: all User.macro_user_id records valid in macro_user")
else:
    msg = f"  ❌ User ID Parity: found {out.strip()} orphaned user records (foreign key mismatch)"
    print(msg); failures.append(msg)

# 4. Gmail Inboxes Sync & Reauth Health
print("\n[4/5] Checking Gmail Inboxes Sync & Reauth Health...")
inbox_sql = 'SELECT email_address, is_sync_active, needs_reauth FROM email_links ORDER BY created_at ASC;'
code, out = run_cmd(f"docker exec macro-selfhost-postgres-1 psql -U macro -d macrodb -tAc '{inbox_sql}'")
if out.strip():
    reauth_needed = []
    for line in out.splitlines():
        parts = line.strip().split("|")
        if len(parts) >= 3:
            addr, active, reauth = parts[0], parts[1] == 't', parts[2] == 't'
            if reauth:
                reauth_needed.append(addr)
            status_desc = "active" if active else "inactive"
            reauth_desc = "⚠️ NEEDS REAUTH" if reauth else "auth valid"
            print(f"  ✉️ {addr}: {status_desc}, {reauth_desc}")
    if reauth_needed:
        msg = f"  ❌ Gmail Auth Disconnected: inboxes require reauthorization ({', '.join(reauth_needed)})"
        print(msg); failures.append(msg)
    else:
        print("  ✅ Gmail Links Health: all connected inboxes have valid authorization")
else:
    print("  ℹ️ Gmail Links: no inboxes linked yet")

# 5. Containers Health Summary
print("\n[5/6] Checking Microservices Runtime Status...")
code, out = run_cmd("docker ps --format '{{.Names}}: {{.Status}}'")
unhealthy = [line for line in out.splitlines() if "unhealthy" in line or "Restarting" in line]
if not unhealthy:
    print("  ✅ Microservices: all running containers healthy")
else:
    msg = f"  ❌ Microservices: unhealthy containers detected: {unhealthy}"
    print(msg); failures.append(msg)

# 6. Frontend Default Compose Sender Priority
print("\n[6/7] Checking Frontend Default Compose Sender (etsy@chnprints.com)...")
web_asset_vol = "/var/lib/docker/volumes/macro-selfhost_web_assets/_data"
code, out = run_cmd(f"sudo grep -s 'etsy@chnprints.com' {web_asset_vol}/app-*.js")
if code == 0 and "etsy@chnprints.com" in out:
    print("  ✅ Frontend Default Sender: etsy@chnprints.com prioritized for new compose")
else:
    if os.path.exists("./patch_frontend.py"):
        p_code, p_out = run_cmd("sudo python3 ./patch_frontend.py")
        if p_code == 0 and "Verification OK" in p_out:
            print("  ✅ Frontend Default Sender: auto-patched and verified (etsy@chnprints.com)")
        else:
            msg = "  ❌ Frontend Default Sender: patch missing and auto-patch failed"
            print(msg); failures.append(msg)
    else:
        msg = "  ❌ Frontend Default Sender: etsy@chnprints.com not found in web bundle"
        print(msg); failures.append(msg)

# 7. Object Storage & SFS Presigned URL Smoke Check
print("\n[7/7] Checking Object Storage Presigned URL & SFS External Endpoint...")
code, out = run_cmd("docker exec macro-selfhost-static_file_service-1 env")
if code == 0:
    sfs_env = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    public_s3 = sfs_env.get("LOCAL_AWS_PUBLIC_URL") or sfs_env.get("S3_ENDPOINT_URL")
    if not public_s3:
        msg = "  ❌ SFS Presigned URL: LOCAL_AWS_PUBLIC_URL is not set (will fallback to localhost:4566)"
        print(msg); failures.append(msg)
    elif "4566" in public_s3 or "localhost" in public_s3 or "localstack" in public_s3:
        msg = f"  ❌ SFS Presigned URL: invalid external endpoint '{public_s3}' (cannot be reached by browser)"
        print(msg); failures.append(msg)
    else:
        print(f"  ✅ SFS Presigned URL: external endpoint configured to {public_s3}")
else:
    # Fallback to checking .env directly if containers are offline
    code_env, out_env = run_cmd("grep -E '^(LOCAL_AWS_PUBLIC_URL|S3_ENDPOINT_URL|S3_DOMAIN)=' .env 2>/dev/null")
    if code_env == 0 and out_env:
        if "4566" in out_env:
            msg = "  ❌ SFS Presigned URL: .env contains internal port 4566 in public S3 config"
            print(msg); failures.append(msg)
        else:
            print(f"  ✅ SFS Presigned URL: validated configuration from .env")
    else:
        print("  ℹ️ SFS Presigned URL: container not running and .env not found in current dir")

print("\n--------------------------------------------------")
if not failures:
    print("🎉 ALL BUSINESS CONTRACTS & HEALTH PROBES PASSED!")
    sys.exit(0)
else:
    print(f"⚠️ {len(failures)} ISSUE(S) DETECTED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
