import os
import sys
import httpx
from dotenv import dotenv_values

env = dotenv_values("backend/.env")
base_url = env.get("SUPABASE_URL")
anon_key = env.get("SUPABASE_ANON_KEY")

if not anon_key:
    print("FATAL: SUPABASE_ANON_KEY not found in backend/.env")
    sys.exit(1)

if not base_url:
    print("FATAL: SUPABASE_URL not found in backend/.env")
    sys.exit(1)

tables = [
    'profiles', 'api_keys', 'okf_docs', 'threads', 'collections',
    'source_snapshots', 'query_logs', 'retractions', 'feedback'
]

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}'
}

print(f"Testing Supabase endpoints with SUPABASE_ANON_KEY from backend/.env")
print(f"Base URL: {base_url}\n")
print(f"{'Endpoint':<28} | {'Status':<6} | {'Rows':<5} | {'First 100 characters of response':<100}")
print("-" * 145)

any_401 = False
any_404_table = False

with httpx.Client(timeout=10.0) as client:
    for table in tables:
        url = f"{base_url.rstrip('/')}/rest/v1/{table}?select=*"
        resp = client.get(url, headers=headers)
        status = resp.status_code
        if status == 401:
            any_401 = True
        if status == 404:
            any_404_table = True
        
        row_count = 0
        if status == 200:
            try:
                data = resp.json()
                if isinstance(data, list):
                    row_count = len(data)
            except Exception:
                pass
        
        first_100 = resp.text.strip().replace("\r", " ").replace("\n", " ")[:100]
        print(f"{table:<28} | {status:<6} | {row_count:<5} | {first_100:<100}")

    # RPC test: /rest/v1/rpc/match_okf_docs (Function does not exist in schema)
    rpc_url = f"{base_url.rstrip('/')}/rest/v1/rpc/match_okf_docs"
    rpc_resp = client.post(
        rpc_url,
        headers=headers,
        json={'query_embedding': [0.0]*384, 'match_threshold': 0.4, 'match_count': 5}
    )
    rpc_status = rpc_resp.status_code
    if rpc_status == 401:
        any_401 = True
    rpc_first_100 = rpc_resp.text.strip().replace("\r", " ").replace("\n", " ")[:100]
    print(f"{'rpc/match_okf_docs':<28} | {rpc_status:<6} | {'N/A':<5} | {rpc_first_100:<100}")

print("-" * 145)

if any_401:
    print("\nFAILED: Received 401 Unauthorized on at least one endpoint. A bad key makes the test invalid.")
    sys.exit(1)
elif any_404_table:
    print("\nFAILED: Received 404 on table endpoint. Table name is wrong.")
    sys.exit(1)
else:
    print("\nSUCCESS: All 9 tables returned valid responses without 401 or 404. Function match_okf_docs does not exist.")
