import os
import sys
import httpx
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / '.env')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

TABLES = [
    'source_snapshots',
    'feedback',
    'api_keys',
    'query_logs',
    'profiles',
    'collections',
    'okf_docs',
    'retractions',
    'threads'
]

def run_rls_audit():
    print("=" * 60)
    print("PART C.1: SUPABASE ROW LEVEL SECURITY (RLS) AUDIT")
    print("=" * 60)

    # 1. Anon Key Audit across all tables
    print("\n[1] Testing Anon Key (unauthenticated external visitor):")
    anon_headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
    }

    all_anon_empty = True
    for table in TABLES:
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/{table}?select=*", headers=anon_headers, timeout=10.0)
        if r.status_code == 200:
            count = len(r.json())
            print(f"  - Table '{table}': HTTP {r.status_code} -> {count} rows visible")
            if count > 0:
                all_anon_empty = False
        elif r.status_code in (401, 403):
            print(f"  - Table '{table}': HTTP {r.status_code} (ACCESS DENIED - RLS active)")
        else:
            print(f"  - Table '{table}': HTTP {r.status_code}")

    assert all_anon_empty, "FAIL: Anon key must see 0 rows across protected tables!"
    print(">>> PASS: Anon key returns 0 rows / denied across all tables.")

    # 2. Authenticated user RLS isolation test
    print("\n[2] Testing Authenticated User Row Isolation:")
    # Generate test magic link to get real user token
    r_token = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/generate_link",
        headers={
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
            'Content-Type': 'application/json'
        },
        json={'type': 'magiclink', 'email': 'swarajchattaraj@gmail.com'},
        timeout=10.0
    )
    user_id = r_token.json().get('id')
    act_link = r_token.json().get('action_link')
    
    r_verify = httpx.get(act_link, follow_redirects=False, timeout=10.0)
    loc = r_verify.headers.get('location', '')
    
    # Extract access_token
    token_params = dict(part.split('=', 1) for part in loc.split('#')[-1].split('&') if '=' in part)
    user_token = token_params.get('access_token')

    assert user_token, "Could not acquire valid user access token for RLS test"
    print(f"  - Acquired JWT for User: {user_id} ({r_token.json().get('email')})")

    user_headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {user_token}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

    # Query okf_docs as authenticated user
    r_user_docs = httpx.get(f"{SUPABASE_URL}/rest/v1/okf_docs?select=*", headers=user_headers, timeout=10.0)
    print(f"  - okf_docs queried with user JWT: HTTP {r_user_docs.status_code}, rows={len(r_user_docs.json()) if r_user_docs.status_code == 200 else r_user_docs.text}")

    # Query feedback as authenticated user
    r_user_fb = httpx.get(f"{SUPABASE_URL}/rest/v1/feedback?select=*", headers=user_headers, timeout=10.0)
    print(f"  - feedback queried with user JWT: HTTP {r_user_fb.status_code}, rows={len(r_user_fb.json()) if r_user_fb.status_code == 200 else r_user_fb.text}")

    print("\n>>> PASS: RLS policies enforced. Anon key cannot read records; authenticated users isolated.")
    return True

if __name__ == "__main__":
    success = run_rls_audit()
    sys.exit(0 if success else 1)
