import os
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

# OAuth2 Scheme for extracting token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ALGORITHM = "HS256"

def get_auth_settings():
    username = os.getenv("ARIA_USERNAME")
    password_hash = os.getenv("ARIA_PASSWORD_HASH")
    jwt_secret = os.getenv("ARIA_JWT_SECRET")
    return username, password_hash, jwt_secret

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
    username, _, jwt_secret = get_auth_settings()
    if not jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT Secret is not configured on the server."
        )
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=[ALGORITHM])
        token_username: str = payload.get("sub")
        if token_username is None or token_username != username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return token_username
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
