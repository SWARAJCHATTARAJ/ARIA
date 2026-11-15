import asyncio
import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from utils.api_security import verify_supabase_jwt
from fastapi import HTTPException

async def test_invalid_jwt():
    print("Testing verify_supabase_jwt with invalid token...")
    try:
        await verify_supabase_jwt("garbage_token_12345")
        print("FAIL: Should have raised 401")
        return False
    except HTTPException as exc:
        print(f"PASS: Raised HTTPException status_code={exc.status_code}, detail={exc.detail}")
        return exc.status_code == 401
    except Exception as exc:
        print(f"FAIL: Raised unexpected exception: {type(exc)}: {exc}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_invalid_jwt())
    sys.exit(0 if success else 1)
