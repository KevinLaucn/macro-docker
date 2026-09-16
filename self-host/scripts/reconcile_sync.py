#!/usr/bin/env python3
"""Macro Self-Host Unified Sync & Index Reconciler.

Reconciles two critical data pipelines in Macro self-host:
1. OpenSearch Email Index: detects differences between PostgreSQL and OpenSearch,
   removes orphan deleted messages via _delete_by_query, and triggers Search Processing Service backfill.
2. Gmail Sync Progress: detects inboxes whose historyId has fallen behind Google's official state,
   fetches latest remote historyId via OAuth token, and enqueues sync tasks into gmail_inbox_sync.

Usage:
  python3 reconcile_sync.py [--dry-run] [--apply] [--opensearch-only] [--gmail-only]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

# Load shared environment
env_paths = [
    os.environ.get("MACRO_SHARED_ENV_FILE", "/etc/macro/macro.env"),
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    "self-host/.env",
    ".env",
]
env: dict[str, str] = {}
for p in env_paths:
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
        break


def run_cmd(cmd: str, timeout: int = 30) -> tuple[int, str]:
    res = subprocess.run(
        cmd,
        shell=True,
        executable="/bin/bash",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
    )
    if res.returncode != 0 and not res.stdout:
        return res.returncode, res.stderr.strip()
    return res.returncode, res.stdout.strip()


def run_psql(sql: str, timeout: int = 30) -> str:
    res = subprocess.run(
        f'docker exec $(docker ps -q -f name=postgres) psql -U macro -d macrodb -tAc "{sql}"',
        shell=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout.strip()


def http_request(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: dict | list | None = None,
    timeout: int = 15,
) -> tuple[int, dict | str]:
    req_headers = headers or {}
    encoded_data = None
    if data is not None:
        encoded_data = json.dumps(data).encode("utf-8")
        if "Content-Type" not in req_headers:
            req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        url, data=encoded_data, headers=req_headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            res_body = response.read().decode("utf-8")
            status = response.status
            try:
                return status, json.loads(res_body)
            except Exception:
                return status, res_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body
    except Exception as e:
        return 0, str(e)


def reconcile_opensearch(dry_run: bool = True) -> bool:
    print("\n[1/2] Checking OpenSearch Email Index Parity...")
    code, host_ip = run_cmd("docker inspect macro-selfhost-opensearch-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'")
    os_host = f"http://{host_ip.strip().split()[0]}:9200" if host_ip.strip() else "http://localhost:9200"

    pg_sql = """
    SELECT m.id::text
    FROM email_messages m
    WHERE m.is_draft = false
      AND (m.body_text IS NOT NULL OR m.body_html_sanitized IS NOT NULL)
      AND NOT EXISTS (
          SELECT 1
          FROM email_message_labels ml
          JOIN email_labels l ON l.id = ml.label_id
          WHERE ml.message_id = m.id
            AND l.provider_label_id IN ('SPAM', 'TRASH')
      );
    """
    try:
        pg_ids_raw = run_psql(pg_sql)
        pg_ids = set(filter(None, [line.strip() for line in pg_ids_raw.splitlines()]))
    except Exception as e:
        print(f"  ❌ Failed to query PostgreSQL email_messages: {e}")
        return False

    os_count_status, os_count_res = http_request(f"{os_host}/emails_v2/_count")
    if os_count_status != 200 or not isinstance(os_count_res, dict):
        code, out = run_cmd("docker exec macro-selfhost-opensearch-1 curl -s http://localhost:9200/emails_v2/_count")
        try:
            os_count_res = json.loads(out)
        except Exception:
            print(f"  ❌ Failed to query OpenSearch count: {out}")
            return False

    total_os = os_count_res.get("count", 0)
    print(f"  📊 PostgreSQL valid messages: {len(pg_ids)}, OpenSearch indexed: {total_os}")

    diff = len(pg_ids) - total_os
    if diff == 0:
        print("  ✅ OpenSearch index is completely aligned with PostgreSQL!")
        return True

    print(f"  ⚠️ Parity discrepancy detected (diff: {diff})")
    if dry_run:
        print("  ℹ️ Dry-run mode: no changes applied. Use --apply to reconcile.")
        return False

    print("  🔄 Fetching OpenSearch document IDs via scroll...")
    os_ids = set()
    scroll_code, scroll_out = run_cmd(
        """docker exec macro-selfhost-opensearch-1 curl -s -X POST "http://localhost:9200/emails_v2/_search?scroll=2m&size=5000" -H "Content-Type: application/json" -d '{"_source":["message_id"]}'"""
    )
    try:
        scroll_json = json.loads(scroll_code == 0 and scroll_out or "{}")
        scroll_id = scroll_json.get("_scroll_id")
        hits = scroll_json.get("hits", {}).get("hits", [])
        for hit in hits:
            mid = hit.get("_source", {}).get("message_id")
            if mid:
                os_ids.add(mid)

        while scroll_id and hits:
            next_code, next_out = run_cmd(
                f"""docker exec macro-selfhost-opensearch-1 curl -s -X POST "http://localhost:9200/_search/scroll" -H "Content-Type: application/json" -d '{{"scroll":"2m","scroll_id":"{scroll_id}"}}'"""
            )
            next_json = json.loads(next_out)
            scroll_id = next_json.get("_scroll_id")
            hits = next_json.get("hits", {}).get("hits", [])
            for hit in hits:
                mid = hit.get("_source", {}).get("message_id")
                if mid:
                    os_ids.add(mid)
    except Exception as e:
        print(f"  ❌ Error scrolling OpenSearch: {e}")

    orphans = list(os_ids - pg_ids)
    missing = list(pg_ids - os_ids)

    if orphans:
        print(f"  🗑️ Deleting {len(orphans)} orphaned documents from OpenSearch...")
        for i in range(0, len(orphans), 100):
            chunk = orphans[i : i + 100]
            del_payload = json.dumps({"query": {"terms": {"message_id": chunk}}})
            run_cmd(
                f"""docker exec macro-selfhost-opensearch-1 curl -s -X POST "http://localhost:9200/emails_v2/_delete_by_query?refresh=true" -H "Content-Type: application/json" -d '{del_payload}'"""
            )
        print("  ✅ Orphaned documents deleted.")

    if missing:
        print(f"  📥 Enqueuing backfill for {len(missing)} missing messages...")
        sql_ids = ",".join(f"'{m}'" for m in missing)
        thread_ids_raw = run_psql(f"SELECT DISTINCT thread_id::text FROM email_messages WHERE id IN ({sql_ids});")
        thread_ids = [t.strip() for t in thread_ids_raw.splitlines() if t.strip()]

        if thread_ids:
            sps_payload = json.dumps({"thread_ids": thread_ids})
            internal_key = env.get("INTERNAL_API_SECRET_KEY", "")
            auth_header = f'-H "x-internal-auth-key: {internal_key}"' if internal_key else ""
            run_cmd(
                f"""docker exec macro-selfhost-search_processing_service-1 curl -s -X POST "http://localhost:8080/search-processing/internal/backfill/emails" -H "Content-Type: application/json" {auth_header} -d '{sps_payload}'"""
            )
            print(f"  ✅ Backfill triggered via Search Processing Service for {len(thread_ids)} threads.")

    return True


def reconcile_gmail_sync(dry_run: bool = True) -> bool:
    print("\n[2/2] Checking Gmail Sync & History ID Progress...")
    query_sql = """
    SELECT
        el.id::text,
        el.email_address,
        el.fusionauth_user_id,
        el.is_sync_active,
        el.needs_reauth,
        gh.history_id,
        gh.updated_at
    FROM email_links el
    LEFT JOIN email_gmail_histories gh ON gh.link_id = el.id
    WHERE el.is_sync_active = true AND el.needs_reauth = false
    ORDER BY el.created_at ASC;
    """
    try:
        raw = run_psql(query_sql)
    except Exception as e:
        print(f"  ❌ Failed to query email_links: {e}")
        return False

    if not raw.strip():
        print("  ℹ️ No active Gmail links found.")
        return True

    fa_api_key = env.get("FUSIONAUTH_API_KEY")
    gmail_idp_id = env.get("GOOGLE_GMAIL_IDP_ID", "55555555-5555-4555-8555-555555555555")

    code, fa_ip = run_cmd("docker inspect macro-selfhost-fusionauth-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'")
    fa_base = f"http://{fa_ip.strip().split()[0]}:9011" if fa_ip.strip() else "http://localhost:9011"

    stale_inboxes = []

    for line in raw.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        link_id, email, fa_user_id, is_sync, needs_reauth = parts[0], parts[1], parts[2], parts[3] == "t", parts[4] == "t"
        local_history_id = parts[5] if len(parts) > 5 and parts[5] != "" else None

        status, links_res = http_request(
            f"{fa_base}/api/identity-provider/link?userId={fa_user_id}&identityProviderId={gmail_idp_id}",
            headers={"Authorization": fa_api_key or ""},
        )
        if status != 200 or not isinstance(links_res, dict):
            print(f"  ⚠️ {email}: unable to fetch OAuth link from FusionAuth")
            continue

        links = links_res.get("identityProviderLinks", [])
        matched = next((l for l in links if l.get("displayName") == email), None)
        if not matched or not matched.get("token"):
            print(f"  ⚠️ {email}: no token in FusionAuth link")
            continue

        refresh_token = matched["token"]
        g_client_id = env.get("GOOGLE_CLIENT_ID", "")
        g_client_secret = env.get("GOOGLE_CLIENT_SECRET_KEY", "")
        if not g_client_id or not g_client_secret:
            print(f"  ⚠️ {email}: GOOGLE_CLIENT_ID or SECRET not configured")
            continue

        token_url = "https://oauth2.googleapis.com/token"
        token_data = urllib.parse.urlencode({
            "client_id": g_client_id,
            "client_secret": g_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }).encode("utf-8")

        req = urllib.request.Request(token_url, data=token_data, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as tr:
                token_resp = json.loads(tr.read().decode("utf-8"))
                access_token = token_resp.get("access_token")
        except Exception as e:
            print(f"  ❌ {email}: failed to refresh Google token: {e}")
            continue

        if not access_token:
            continue

        prof_status, prof_res = http_request(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if prof_status != 200 or not isinstance(prof_res, dict):
            print(f"  ❌ {email}: failed to fetch Gmail profile: {prof_res}")
            continue

        remote_history_id = str(prof_res.get("historyId", ""))
        is_stale = (local_history_id is None) or (local_history_id != remote_history_id)
        status_tag = "⚠️ BEHIND" if is_stale else "✅ SYNCED"
        print(f"  📧 {email}: local history={local_history_id}, remote={remote_history_id} [{status_tag}]")

        if is_stale:
            stale_inboxes.append({
                "link_id": link_id,
                "email": email,
                "history_id": int(remote_history_id),
            })

    if not stale_inboxes:
        print("  ✅ All linked Gmail inboxes are fully synced with Google API!")
        return True

    print(f"  ⚠️ Found {len(stale_inboxes)} inbox(es) with lagging history.")
    if dry_run:
        print("  ℹ️ Dry-run mode: no changes applied. Use --apply to wake up sync workers.")
        return False

    print(f"  🚀 Enqueuing sync notifications to wake up pubsub workers...")
    for item in stale_inboxes:
        payload = {
            "linkId": item["link_id"],
            "operation": {
                "gmail_message": {
                    "history_id": item["history_id"]
                }
            }
        }
        body = json.dumps(payload, separators=(",", ":"))
        subprocess.run(
            [
                "docker", "exec", "macro-selfhost-localstack-1",
                "awslocal", "sqs", "send-message",
                "--queue-url", "http://localstack:4566/000000000000/email-service-gmail-inbox-sync-queue",
                "--message-body", body,
            ],
            check=True, capture_output=True, text=True, timeout=10
        )
        print(f"  ✅ Enqueued sync for {item['email']} (history_id: {item['history_id']})")

    return True


def main():
    parser = argparse.ArgumentParser(description="Macro Self-Host Unified Sync & Index Reconciler")
    parser.add_argument("--apply", action="store_true", help="Apply fixes (default is dry-run)")
    parser.add_argument("--opensearch-only", action="store_true", help="Reconcile only OpenSearch email index")
    parser.add_argument("--gmail-only", action="store_true", help="Reconcile only Gmail sync progress")
    args = parser.parse_args()

    dry_run = not args.apply

    print("==================================================")
    print("    Macro Self-Host Unified Reconciler (Sync & Index)")
    print("==================================================")
    if dry_run:
        print("Mode: [DRY-RUN] (use --apply to execute fixes)\n")
    else:
        print("Mode: [APPLY] (modifications will be made)\n")

    if not args.gmail_only:
        reconcile_opensearch(dry_run=dry_run)

    if not args.opensearch_only:
        reconcile_gmail_sync(dry_run=dry_run)

    print("\n--------------------------------------------------")
    print("Finished.")


if __name__ == "__main__":
    main()
