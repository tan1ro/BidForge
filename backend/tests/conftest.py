"""Ensure required env is set before backend modules (config) load in tests."""
import os

# JWT must not be the insecure default; config validates on import.
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-must-be-non-default-32chars")
os.environ.setdefault("MONGODB_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DATABASE_NAME", "bidforge_test")
os.environ.setdefault("APP_ENV", "test")
