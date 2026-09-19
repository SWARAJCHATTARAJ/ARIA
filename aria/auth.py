from __future__ import annotations

import logging

logger = logging.getLogger(__name__)
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

# OAuth2 Scheme for extracting token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ALGORITHM = "HS256"
DB_PATH = Path(".aria_sessions") / "users.db"

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if db_url and (db_url.startswith(("postgres://", "postgresql://"))):
        # Supabase database URLs start with postgres://, but psycopg2 prefers postgresql://
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        
        # Ensure password is URL-encoded if it contains '@' or other special chars
        import urllib.parse
        try:
            scheme, _sep, rest = db_url.partition("://")
            cred_part, _sep_at, host_part = rest.rpartition("@")
            if cred_part:
                user, _sep_colon, password = cred_part.partition(":")
                if password:
                    unquoted_password = urllib.parse.unquote(password)
                    quoted_password = urllib.parse.quote(unquoted_password)
                    db_url = f"{scheme}://{user}:{quoted_password}@{host_part}"
        except Exception as e:
            logger.warning(f"Failed to sanitize DATABASE_URL: {e}")

        import psycopg2
        return psycopg2.connect(db_url)
    else:
        conn = sqlite3.connect(str(DB_PATH))
        return conn

def init_db():
    try:
        Path(".aria_sessions").mkdir(parents=True, exist_ok=True)
        db_url = os.getenv("DATABASE_URL")
        is_postgres = db_url and (db_url.startswith(("postgres://", "postgresql://")))
        
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            if is_postgres:
                try:
                    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
                except Exception as e:
                    logger.warning(f"Failed to enable pgvector extension: {e}")
                
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS sessions (
                        id VARCHAR(255) PRIMARY KEY,
                        user_id VARCHAR(255),
                        title VARCHAR(255),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        result JSONB
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vector_memory (
                        id VARCHAR(255) PRIMARY KEY,
                        document TEXT,
                        metadata JSONB,
                        embedding vector(1536)
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS query_cache (
                        id SERIAL PRIMARY KEY,
                        question TEXT NOT NULL,
                        embedding vector(1536) NOT NULL,
                        result JSONB NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            else:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS query_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        question TEXT NOT NULL,
                        embedding TEXT NOT NULL,
                        result TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Database initialization failed: {e}")

# Initialize DB at startup
init_db()


# Cache variables for JWKS
_JWKS_CACHE = None
_JWKS_CACHE_TIME = 0

async def get_supabase_jwks():
    global _JWKS_CACHE, _JWKS_CACHE_TIME
    now = time.time()
    if _JWKS_CACHE and (now - _JWKS_CACHE_TIME) < 3600:
        return _JWKS_CACHE

    supabase_url = os.getenv("VITE_SUPABASE_URL", "https://buwixynplswefemmoshf.supabase.co")
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10.0)
        resp.raise_for_status()
        _JWKS_CACHE = resp.json()
        _JWKS_CACHE_TIME = now
        return _JWKS_CACHE

async def verify_supabase_token(token: str) -> dict:
    jwks = await get_supabase_jwks()
    try:
        payload = jwt.decode(
            token, 
            jwks, 
            algorithms=["HS256", "RS256", "ES256"], 
            audience="authenticated"
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate Supabase token: {e}"
        )

async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> str:
    """Verify Supabase token and return GitHub username as the user_id."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # First, try to verify as a Supabase JWT
        payload = await verify_supabase_token(token)
        
        # Extract GitHub username
        user_metadata = payload.get("user_metadata", {})
        github_username = user_metadata.get("preferred_username")
        
        if github_username:
            # If the user is swarajchattaraj, ensure they are treated as admin 
            # (sessions.py checks against admin_user_id)
            if github_username.lower() == "swarajchattaraj":
                return "swaraj_admin" # Map to the default admin ID
            return github_username.lower()
            
        # Fallback if email is used instead of GitHub
        email = payload.get("email")
        if email:
            return email.lower()
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not extract GitHub username or email from Supabase token"
        )
        
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )# Cache variables for JWKS

