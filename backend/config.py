import os
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_INSECURE_JWT = "change-me-in-production"


def _read_jwt_secret() -> str:
    raw = os.getenv("JWT_SECRET", "").strip()
    if not raw or raw == _DEFAULT_INSECURE_JWT:
        raise SystemExit(
            "JWT_SECRET must be set in the environment to a non-default value (never use change-me-in-production). "
            "See .env.example."
        )
    return raw


class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    is_production: bool = app_env == "production"
    mongodb_url: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    database_name: str = os.getenv("DATABASE_NAME", "british_auction_rfq")
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:5174,http://localhost:3000",
        ).split(",")
        if origin.strip()
    ]
    # Restrict: set to your Vercel deployment, e.g. ^https://bidforge-xxxxx\\.vercel\\.app$
    # Empty disables regex-based origin matching.
    cors_origin_regex: str = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    jwt_secret: str = _read_jwt_secret()
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expires_minutes: int = int(os.getenv("JWT_EXPIRES_MINUTES", "120"))
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
    rate_limit_bid_submit_per_minute: int = int(os.getenv("RATE_LIMIT_BID_SUBMIT_PER_MINUTE", "10"))
    rate_limiter_max_host_paths: int = int(os.getenv("RATE_LIMITER_MAX_HOST_PATHS", "4096"))
    technical_specs_base_url: str = os.getenv("TECHNICAL_SPECS_BASE_URL", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()


settings = Settings()
