from datetime import datetime, timedelta, timezone
from enum import Enum
import base64
import hashlib
import hmac
import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from config import settings
from database import users_collection


class UserRole(str, Enum):
    BUYER = "buyer"
    SUPPLIER = "supplier"


class UserPrincipal(BaseModel):
    username: str
    role: UserRole


class LoginRequest(BaseModel):
    company_name: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    company_name: str


class UserProfileResponse(BaseModel):
    company_name: str
    email: str
    role: UserRole
    created_at: datetime


bearer_scheme = HTTPBearer(auto_error=False)
legacy_pwd_context = CryptContext(schemes=["bcrypt", "bcrypt_sha256"], deprecated="auto")
PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 390000
PBKDF2_SALT_BYTES = 16


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value.encode("ascii"))


async def authenticate_user(company_name_or_email: str, password: str) -> UserPrincipal | None:
    user = await users_collection.find_one({"$or": [{"username": company_name_or_email}, {"email": company_name_or_email}]})
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return UserPrincipal(username=user["username"], role=UserRole(user["role"]))


async def get_login_error(company_name_or_email: str, password: str) -> str | None:
    user = await users_collection.find_one({"$or": [{"username": company_name_or_email}, {"email": company_name_or_email}]})
    if not user:
        return "Company name or email does not exist"
    if not verify_password(password, user["password_hash"]):
        return "Incorrect password"
    return None


def hash_password(password: str) -> str:
    salt = os.urandom(PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded_password: str) -> bool:
    # Backward compatibility: existing users may still have passlib bcrypt hashes.
    if encoded_password.startswith("$2a$") or encoded_password.startswith("$2b$") or encoded_password.startswith("$2y$") or encoded_password.startswith("$bcrypt"):
        try:
            return legacy_pwd_context.verify(password, encoded_password)
        except Exception:
            return False

    try:
        algorithm, iterations, salt_b64, hash_b64 = encoded_password.split("$", 3)
        if algorithm != PBKDF2_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64decode(salt_b64),
            int(iterations),
        )
        return hmac.compare_digest(_b64encode(digest), hash_b64)
    except (TypeError, ValueError):
        return False


async def create_user(company_name: str, email: str, password: str, role: UserRole) -> UserPrincipal:
    existing = await users_collection.find_one({"$or": [{"username": company_name}, {"email": email}]})
    if existing:
        raise HTTPException(status_code=409, detail="Company name or email already exists")
    await users_collection.insert_one(
        {
            "username": company_name,
            "email": email,
            "password_hash": hash_password(password),
            "role": role.value,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return UserPrincipal(username=company_name, role=role)


def create_access_token(user: UserPrincipal) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": user.username, "role": user.role.value, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def user_from_token(token: str) -> UserPrincipal:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    username = payload.get("sub")
    role = payload.get("role")
    if not username or role not in {UserRole.BUYER.value, UserRole.SUPPLIER.value}:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return UserPrincipal(username=username, role=UserRole(role))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserPrincipal:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    principal = user_from_token(credentials.credentials)
    user = await users_collection.find_one({"username": principal.username})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return principal


def require_roles(allowed_roles: list[UserRole]):
    def dependency(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency
