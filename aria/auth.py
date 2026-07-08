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

def init_db():
    Path(".aria_sessions").mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cursor = conn.cursor()
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)"
        )
        conn.commit()
    finally:
        conn.close()

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
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cursor = conn.cursor()
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
    
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hashed))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
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
