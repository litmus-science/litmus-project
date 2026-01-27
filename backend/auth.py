"""
Authentication and authorization for Litmus Science Backend.
Supports Bearer tokens (JWT) and API keys.
"""

import hmac
import os
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, get_db

# Configuration - SECRET_KEY must be set via environment variable
SECRET_KEY = os.environ.get("LITMUS_SECRET_KEY", "")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "LITMUS_SECRET_KEY environment variable not set. "
        "Using insecure default for development only.",
        RuntimeWarning
    )
    SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security schemes
bearer_scheme = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


class TokenData(BaseModel):
    """Token payload data."""
    user_id: str
    email: str
    role: str
    exp: datetime


class AuthUser(BaseModel):
    """Authenticated user info."""
    id: str
    email: str
    name: Optional[str]
    organization: Optional[str]
    role: str
    rate_limit_tier: str

    class Config:
        from_attributes = True


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def hash_api_key(api_key: str) -> str:
    """Hash API key using HMAC-SHA256 and the server secret."""
    key = SECRET_KEY.encode("utf-8")
    return hmac.new(key, api_key.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_api_key(api_key: str, api_key_hash: str) -> bool:
    """Constant-time verify for API key hashes."""
    expected = hash_api_key(api_key)
    return hmac.compare_digest(expected, api_key_hash)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(
            user_id=payload.get("sub"),
            email=payload.get("email"),
            role=payload.get("role", "requester"),
            exp=datetime.fromtimestamp(payload.get("exp"))
        )
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Get user by email."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_api_key(db: AsyncSession, api_key: str) -> Optional[User]:
    """Get user by API key."""
    api_key_hash = hash_api_key(api_key)
    result = await db.execute(select(User).where(User.api_key_hash == api_key_hash))
    user = result.scalar_one_or_none()
    if user:
        return user

    # Backward-compat: migrate plaintext api_key to hash if present
    result = await db.execute(select(User).where(User.api_key == api_key))
    user = result.scalar_one_or_none()
    if user:
        user.api_key_hash = api_key_hash
        user.api_key = None
        await db.commit()
    return user


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """Authenticate user with email and password."""
    user = await get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    api_key: Optional[str] = Security(api_key_header),
    db: AsyncSession = Depends(get_db)
) -> AuthUser:
    """
    Get current authenticated user from Bearer token or API key.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Try Bearer token first
    if credentials:
        token_data = decode_token(credentials.credentials)
        if token_data:
            user = await get_user_by_id(db, token_data.user_id)
            if user and user.is_active:
                return AuthUser(
                    id=user.id,
                    email=user.email,
                    name=user.name,
                    organization=user.organization,
                    role=user.role,
                    rate_limit_tier=user.rate_limit_tier
                )

    # Try API key
    if api_key:
        user = await get_user_by_api_key(db, api_key)
        if user and user.is_active:
            return AuthUser(
                id=user.id,
                email=user.email,
                name=user.name,
                organization=user.organization,
                role=user.role,
                rate_limit_tier=user.rate_limit_tier
            )

    raise credentials_exception


async def get_current_operator(
    current_user: AuthUser = Depends(get_current_user)
) -> AuthUser:
    """Require current user to be an operator."""
    if current_user.role not in ["operator", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator role required"
        )
    return current_user


async def get_current_admin(
    current_user: AuthUser = Depends(get_current_user)
) -> AuthUser:
    """Require current user to be an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required"
        )
    return current_user


# Rate limiting configuration
RATE_LIMITS = {
    "standard": {"per_minute": 100, "per_day": 1000},
    "pro": {"per_minute": 1000, "per_day": 10000},
    "ai_agent": {"per_minute": 500, "per_day": 5000},
}


def get_rate_limit(tier: str) -> dict:
    """Get rate limit for a tier."""
    return RATE_LIMITS.get(tier, RATE_LIMITS["standard"])
