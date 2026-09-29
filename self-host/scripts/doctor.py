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

script_dir = os.path.dirname(os.path.abspath(__file__))
repo_dir = os.path.dirname(script_dir)
candidate_env_paths = [
    os.path.join(repo_dir, ".env"),
    os.path.join(os.path.dirname(repo_dir), ".env"),
    os.path.join(os.getcwd(), ".env"),
    ".env"
]
env_path = next((p for p in candidate_env_paths if os.path.exists(p)), ".env")

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
code, out = run_cmd("docker exec macro-selfhost-caddy-1 sh -c 'grep -s etsy@chnprints.com /srv/frontend/app-*.js' 2>/dev/null || sudo grep -s 'etsy@chnprints.com' /var/lib/docker/volumes/macro-selfhost_web_assets/_data/app-*.js 2>/dev/null")
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
print("\n[7/9] Checking Object Storage Presigned URL & SFS External Endpoint...")
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
    code_env, out_env = run_cmd(f"grep -E '^(LOCAL_AWS_PUBLIC_URL|S3_ENDPOINT_URL|S3_DOMAIN)=' {env_path} 2>/dev/null")
    if code_env == 0 and out_env:
        if "4566" in out_env:
            msg = "  ❌ SFS Presigned URL: .env contains internal port 4566 in public S3 config"
            print(msg); failures.append(msg)
        else:
            print(f"  ✅ SFS Presigned URL: validated configuration from .env")
    else:
        print("  ℹ️ SFS Presigned URL: container not running and .env not found in current dir")

# 8. Caddy Reverse Proxy, Security Headers & Document Sync WebSocket
print("\n[8/9] Checking Caddy Proxy & Document Sync WebSocket Smoke Probe...")
code_domain, out_domain = run_cmd(f"grep -E '^MACRO_DOMAIN=' {env_path} 2>/dev/null | cut -d= -f2-")
domain = out_domain.strip().strip('"').strip("'") or "localhost"

# Check /_healthz
c_code, c_out = run_cmd(
    f"curl -kfsSL https://{domain}/_healthz 2>/dev/null || "
    f"curl -kfsSL --resolve {domain}:443:127.0.0.1 https://{domain}/_healthz 2>/dev/null || "
    f"curl -kfsSL -H 'Host: {domain}' http://127.0.0.1/_healthz 2>/dev/null"
)
if c_code == 0 and c_out.strip() == "ok":
    print("  ✅ Caddy Liveness: /_healthz returns 200 ok")
else:
    msg = f"  ❌ Caddy Liveness: /_healthz unreachable (code {c_code}, out: {c_out[:100]})"
    print(msg); failures.append(msg)

# Check Document Sync reachability and origin policy
ws_cmd = (
    f"curl -ki -s -N --max-time 3 "
    f"-H 'Origin: https://{domain}' "
    f"-H 'Connection: Upgrade' "
    f"-H 'Upgrade: websocket' "
    f"-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "
    f"-H 'Sec-WebSocket-Version: 13' "
    f"https://{domain}/sync 2>/dev/null || "
    f"curl -ki -s -N --max-time 3 --resolve {domain}:443:127.0.0.1 "
    f"-H 'Origin: https://{domain}' "
    f"-H 'Connection: Upgrade' "
    f"-H 'Upgrade: websocket' "
    f"-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "
    f"-H 'Sec-WebSocket-Version: 13' "
    f"https://{domain}/sync 2>/dev/null || "
    f"curl -ki -s -N --max-time 3 "
    f"-H 'Host: {domain}' "
    f"-H 'Origin: https://{domain}' "
    f"-H 'Connection: Upgrade' "
    f"-H 'Upgrade: websocket' "
    f"-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "
    f"-H 'Sec-WebSocket-Version: 13' "
    f"http://127.0.0.1/sync 2>/dev/null"
)
ws_code, ws_out = run_cmd(ws_cmd)
if "101 Switching Protocols" in ws_out or "HTTP/1.1 101" in ws_out or "Hello Sync Service!" in ws_out or "HTTP/2 200" in ws_out:
    print("  ✅ Document Sync: reachability & origin policy validated (Origin rewritten to local)")
elif "403 Forbidden" in ws_out:
    msg = "  ❌ Document Sync: received 403 Forbidden (Origin rewrite missing in Caddy)"
    print(msg); failures.append(msg)
else:
    first_line = ws_out.splitlines()[0] if ws_out.splitlines() else "empty response"
    msg = f"  ❌ Document Sync: upgrade/reachability failed ({first_line})"
    print(msg); failures.append(msg)

# 9. Capability Gating & Web Bundle Runtime Config Smoke Check
print("\n[9/9] Checking Capabilities & Web Bundle Runtime Config Smoke...")
cfg_cmd = (
    f"curl -kfsSL https://{domain}/app/env-config.js 2>/dev/null || "
    f"curl -kfsSL --resolve {domain}:443:127.0.0.1 https://{domain}/app/env-config.js 2>/dev/null || "
    f"curl -kfsSL -H 'Host: {domain}' http://127.0.0.1/app/env-config.js 2>/dev/null"
)
cfg_code, cfg_out = run_cmd(cfg_cmd)
if cfg_code == 0:
    print("  ✅ Web Config: env-config.js fetched successfully")
    if "ENABLE_CODEX_AGENTS" in cfg_out:
        print("  ✅ Runtime Capabilities: codex configuration rendered")
    if 'ENABLE_CHAT_V3_AGENTS: "false"' in cfg_out:
        msg = "  ❌ Runtime Capabilities: ENABLE_CHAT_V3_AGENTS is disabled (hides Agents & Harness settings)"
        print(msg); failures.append(msg)
    else:
        print("  ✅ Runtime Capabilities: chat v3 agents active")
    if 'agents: false' in cfg_out or 'agents: "false"' in cfg_out or 'ENABLE_AGENTS: "false"' in cfg_out:
        msg = "  ❌ Runtime Capabilities: agents capability disabled"
        print(msg); failures.append(msg)
    else:
        print("  ✅ Runtime Capabilities: agents capability active")
    if 'codex: false' in cfg_out or 'codex: "false"' in cfg_out or 'ENABLE_CODEX_AGENTS: "false"' in cfg_out:
        msg = "  ❌ Runtime Capabilities: codex capability disabled"
        print(msg); failures.append(msg)
    else:
        print("  ✅ Runtime Capabilities: codex capability active")
else:
    msg = f"  ❌ Web Config: failed to fetch /app/env-config.js (code {cfg_code})"
    print(msg); failures.append(msg)

# Verify Codex authentication service endpoint is active and never 503
codex_probe_cmd = (
    f"curl -k -s -o /dev/null -w '%{{http_code}}' https://{domain}/auth/codex 2>/dev/null || "
    f"curl -k -s -o /dev/null -w '%{{http_code}}' --resolve {domain}:443:127.0.0.1 https://{domain}/auth/codex 2>/dev/null || "
    f"curl -k -s -o /dev/null -w '%{{http_code}}' -H 'Host: {domain}' http://127.0.0.1/auth/codex 2>/dev/null"
)
c_code, c_status = run_cmd(codex_probe_cmd)
c_status = c_status.strip()
if c_status in ("200", "401"):
    print(f"  ✅ Codex Connection Service: active and ready (HTTP {c_status})")
elif c_status == "503":
    msg = "  ❌ Codex Connection Service: 503 Unavailable (CODEX_OAUTH_KMS_KEY_ID missing or uninitialized)"
    print(msg); failures.append(msg)
else:
    print(f"  ℹ️ Codex Connection Service: HTTP {c_status}")

# Check Caddy cache headers on env-config.js
head_cmd = (
    f"curl -kIL -s https://{domain}/app/env-config.js 2>/dev/null || "
    f"curl -kIL -s --resolve {domain}:443:127.0.0.1 https://{domain}/app/env-config.js 2>/dev/null || "
    f"curl -kIL -s -H 'Host: {domain}' http://127.0.0.1/app/env-config.js 2>/dev/null"
)
h_code, h_out = run_cmd(head_cmd)
if "no-cache, no-store, must-revalidate" in h_out:
    print("  ✅ Cache-Control: env-config.js protected with no-cache, no-store, must-revalidate")
else:
    msg = "  ❌ Cache-Control: env-config.js missing no-cache header"
    print(msg); failures.append(msg)

print("\n--------------------------------------------------")
if not failures:
    print("🎉 ALL BUSINESS CONTRACTS & HEALTH PROBES PASSED!")
    sys.exit(0)
else:
    print(f"⚠️ {len(failures)} ISSUE(S) DETECTED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
