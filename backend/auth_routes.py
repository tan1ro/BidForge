from fastapi import APIRouter, Depends, HTTPException

from audit import log_audit
from auth import (
    LoginRequest,
    LoginResponse,
    UserProfileResponse,
    get_current_user,
    authenticate_user,
    get_login_error,
    create_user,
    create_access_token,
    UserPrincipal,
    UserRole,
)
from database import users_collection
from models import UserSignup

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    user = await authenticate_user(payload.username, payload.password)
    if not user:
        error_message = await get_login_error(payload.username, payload.password)
        raise HTTPException(status_code=401, detail=error_message or "Invalid credentials")
    token = create_access_token(user)
    await log_audit(
        action="login",
        username=user.username,
        role=user.role.value,
        resource_type="auth",
        metadata={"username": payload.username},
    )
    return LoginResponse(
        access_token=token,
        role=user.role,
        username=user.username,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_profile(user: UserPrincipal = Depends(get_current_user)):
    db_user = await users_collection.find_one({"username": user.username})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileResponse(
        username=db_user["username"],
        email=db_user["email"],
        role=UserRole(db_user["role"]),
        created_at=db_user["created_at"],
    )


@router.post("/signup", response_model=LoginResponse)
async def signup(payload: UserSignup):
    role = UserRole(payload.role)
    user = await create_user(
        username=payload.username,
        email=payload.email,
        password=payload.password,
        role=role,
    )
    token = create_access_token(user)
    await log_audit(
        action="signup",
        username=user.username,
        role=user.role.value,
        resource_type="auth",
        metadata={"email": payload.email},
    )
    return LoginResponse(
        access_token=token,
        role=user.role,
        username=user.username,
    )
