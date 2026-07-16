import os
import bcrypt
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

# OAuth2 Scheme for extracting token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ALGORITHM = "HS256"
DB_PATH = Path(".aria_sessions") / "users.db"

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        # Render database URLs start with postgres://, but psycopg2 prefers postgresql://
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        
        # Ensure password is URL-encoded if it contains '@' or other special chars
        import urllib.parse
        try:
            scheme, sep, rest = db_url.partition("://")
            cred_part, sep_at, host_part = rest.rpartition("@")
            if cred_part:
                user, sep_colon, password = cred_part.partition(":")
                if password:
                    unquoted_password = urllib.parse.unquote(password)
                    quoted_password = urllib.parse.quote(unquoted_password)
                    db_url = f"{scheme}://{user}:{quoted_password}@{host_part}"
        except Exception as e:
            print(f"[Warning] Failed to sanitize DATABASE_URL: {e}")

        import psycopg2
        return psycopg2.connect(db_url)
    else:
        conn = sqlite3.connect(str(DB_PATH))
        return conn

def init_db():
    try:
        Path(".aria_sessions").mkdir(parents=True, exist_ok=True)
        db_url = os.getenv("DATABASE_URL")
        is_postgres = db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://"))
        
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            if is_postgres:
                cursor.execute(
                     "CREATE TABLE IF NOT EXISTS users (username VARCHAR(255) PRIMARY KEY, password_hash VARCHAR(255) NOT NULL)"
                )
                try:
                    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
                except Exception as e:
                    print(f"[Warning] Failed to enable pgvector extension: {e}")
                
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
                        embedding vector(384)
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS query_cache (
                        id SERIAL PRIMARY KEY,
                        question TEXT NOT NULL,
                        embedding vector(384) NOT NULL,
                        result JSONB NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            else:
                cursor.execute(
                    "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)"
                )
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
        print(f"[Warning] Database initialization failed: {e}")

# Initialize DB at startup
init_db()

def get_auth_settings():
    username = os.getenv("ARIA_USERNAME")
    password_hash = os.getenv("ARIA_PASSWORD_HASH")
    jwt_secret = os.getenv("ARIA_JWT_SECRET")
    return username, password_hash, jwt_secret

def get_user_hash(username: str) -> str | None:
    username = username.strip().lower()
    
    # First check env variables (master admin account)
    master_user, master_hash, _ = get_auth_settings()
    if master_user and username == master_user.strip().lower():
        return master_hash

    # Check database
    db_url = os.getenv("DATABASE_URL")
    is_postgres = db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://"))
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if is_postgres:
            cursor.execute("SELECT password_hash FROM users WHERE username = %s", (username,))
        else:
            cursor.execute("SELECT password_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        return row[0] if row else None
    finally:
        conn.close()

def create_user(username: str, password: str) -> bool:
    username = username.strip().lower()
    
    # Check if username conflicts with master admin username
    master_user, _, _ = get_auth_settings()
    if master_user and username == master_user.strip().lower():
        return False
        
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    db_url = os.getenv("DATABASE_URL")
    is_postgres = db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://"))
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if is_postgres:
            cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (username, hashed))
        else:
            cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hashed))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    _, _, jwt_secret = get_auth_settings()
    if not jwt_secret:
        raise ValueError("ARIA_JWT_SECRET environment variable is not configured.")
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, jwt_secret, algorithm=ALGORITHM)

def get_current_user(token: str | None = Depends(oauth2_scheme)) -> str:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _, _, jwt_secret = get_auth_settings()
    if not jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT Secret is not configured on the server."
        )
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=[ALGORITHM])
        token_username: str = payload.get("sub")
        if token_username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify user exists in database or is master user
        db_hash = get_user_hash(token_username)
        if not db_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return token_username
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
