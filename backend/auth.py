from datetime import datetime, timedelta, timezone
from enum import Enum

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
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str


class UserProfileResponse(BaseModel):
    username: str
    email: str
    role: UserRole
    created_at: datetime


bearer_scheme = HTTPBearer(auto_error=False)
# Use bcrypt_sha256 to avoid bcrypt's 72-byte password truncation/validation edge cases
# in some backend versions while keeping bcrypt as the underlying KDF.
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")


async def authenticate_user(username: str, password: str) -> UserPrincipal | None:
    user = await users_collection.find_one({"$or": [{"username": username}, {"email": username}]})
    if not user:
        return None
    if not pwd_context.verify(password, user["password_hash"]):
        return None
    return UserPrincipal(username=user["username"], role=UserRole(user["role"]))


async def get_login_error(username: str, password: str) -> str | None:
    user = await users_collection.find_one({"$or": [{"username": username}, {"email": username}]})
    if not user:
        return "User or email does not exist"
    if not pwd_context.verify(password, user["password_hash"]):
        return "Incorrect password"
    return None


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


async def create_user(username: str, email: str, password: str, role: UserRole) -> UserPrincipal:
    existing = await users_collection.find_one({"$or": [{"username": username}, {"email": email}]})
    if existing:
        raise HTTPException(status_code=409, detail="Username or email already exists")
    await users_collection.insert_one(
        {
            "username": username,
            "email": email,
            "password_hash": hash_password(password),
            "role": role.value,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return UserPrincipal(username=username, role=role)


def create_access_token(user: UserPrincipal) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": user.username, "role": user.role.value, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserPrincipal:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username = payload.get("sub")
        role = payload.get("role")
        if not username or role not in {UserRole.BUYER.value, UserRole.SUPPLIER.value}:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = await users_collection.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="User no longer exists")
        return UserPrincipal(username=username, role=UserRole(role))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_roles(allowed_roles: list[UserRole]):
    def dependency(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency
