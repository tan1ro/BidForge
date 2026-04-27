from fastapi import APIRouter, Depends, HTTPException
from zoneinfo import ZoneInfo

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
    UserSettings,
    UserSettingsUpdateRequest,
    UserProfileUpdateRequest,
)
from database import users_collection
from models import UserSignup

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    user = await authenticate_user(payload.company_name, payload.password)
    if not user:
        error_message = await get_login_error(payload.company_name, payload.password)
        raise HTTPException(status_code=401, detail=error_message or "Invalid credentials")
    token = create_access_token(user)
    await log_audit(
        action="login",
        username=user.username,
        role=user.role.value,
        resource_type="auth",
        metadata={"company_name": payload.company_name},
    )
    return LoginResponse(
        access_token=token,
        role=user.role,
        company_name=user.username,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_profile(user: UserPrincipal = Depends(get_current_user)):
    db_user = await users_collection.find_one({"username": user.username})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileResponse(
        company_name=db_user["username"],
        email=db_user["email"],
        role=UserRole(db_user["role"]),
        company_url=str(db_user.get("company_url") or ""),
        about_company=str(db_user.get("about_company") or ""),
        created_at=db_user["created_at"],
    )


@router.patch("/me", response_model=UserProfileResponse)
async def update_profile(
    payload: UserProfileUpdateRequest,
    user: UserPrincipal = Depends(get_current_user),
):
    company_url = (payload.company_url or "").strip()
    about_company = (payload.about_company or "").strip()
    update_doc = {
        "company_url": company_url,
        "about_company": about_company,
    }
    result = await users_collection.update_one(
        {"username": user.username},
        {"$set": update_doc},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    db_user = await users_collection.find_one({"username": user.username})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    await log_audit(
        action="profile_updated",
        username=user.username,
        role=user.role.value,
        resource_type="auth",
        metadata={"updated_fields": ["company_url", "about_company"]},
    )
    return UserProfileResponse(
        company_name=db_user["username"],
        email=db_user["email"],
        role=UserRole(db_user["role"]),
        company_url=str(db_user.get("company_url") or ""),
        about_company=str(db_user.get("about_company") or ""),
        created_at=db_user["created_at"],
    )


@router.post("/signup", response_model=LoginResponse)
async def signup(payload: UserSignup):
    role = UserRole(payload.role)
    user = await create_user(
        company_name=payload.company_name,
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
        company_name=user.username,
    )


@router.get("/settings", response_model=UserSettings)
async def get_settings(user: UserPrincipal = Depends(get_current_user)):
    db_user = await users_collection.find_one({"username": user.username})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    settings = db_user.get("settings") or {}
    return UserSettings(
        email_notifications=bool(settings.get("email_notifications", True)),
        timezone=str(settings.get("timezone") or "Asia/Kolkata"),
        default_rfq_page_size=int(settings.get("default_rfq_page_size") or 20),
        use_24h_time=bool(settings.get("use_24h_time", False)),
        date_format=str(settings.get("date_format") or "medium"),
        auto_refresh_seconds=int(settings.get("auto_refresh_seconds") or 10),
    )


@router.patch("/settings", response_model=UserSettings)
async def update_settings(
    payload: UserSettingsUpdateRequest,
    user: UserPrincipal = Depends(get_current_user),
):
    timezone_value = (payload.timezone or "").strip()
    if not timezone_value:
        raise HTTPException(status_code=400, detail="Timezone is required")
    try:
        ZoneInfo(timezone_value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid timezone")
    if payload.default_rfq_page_size < 5 or payload.default_rfq_page_size > 100:
        raise HTTPException(status_code=400, detail="Default RFQ page size must be between 5 and 100")
    if payload.date_format not in {"short", "medium", "long"}:
        raise HTTPException(status_code=400, detail="Date format must be one of: short, medium, long")
    if payload.auto_refresh_seconds < 5 or payload.auto_refresh_seconds > 120:
        raise HTTPException(status_code=400, detail="Auto refresh seconds must be between 5 and 120")

    settings_doc = {
        "email_notifications": bool(payload.email_notifications),
        "timezone": timezone_value,
        "default_rfq_page_size": int(payload.default_rfq_page_size),
        "use_24h_time": bool(payload.use_24h_time),
        "date_format": payload.date_format,
        "auto_refresh_seconds": int(payload.auto_refresh_seconds),
    }
    result = await users_collection.update_one(
        {"username": user.username},
        {"$set": {"settings": settings_doc}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_audit(
        action="profile_settings_updated",
        username=user.username,
        role=user.role.value,
        resource_type="auth",
        metadata=settings_doc,
    )
    return UserSettings(**settings_doc)

