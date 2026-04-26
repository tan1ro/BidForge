from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.append(str(Path(__file__).resolve().parents[1]))

import auth


class FakeUsersCollection:
    def __init__(self):
        self.users = []

    async def find_one(self, query):
        if "$or" in query:
            for user in self.users:
                for clause in query["$or"]:
                    key, value = list(clause.items())[0]
                    if user.get(key) == value:
                        return user
            return None

        for user in self.users:
            if all(user.get(k) == v for k, v in query.items()):
                return user
        return None

    async def insert_one(self, doc):
        self.users.append(doc)


@pytest.mark.asyncio
async def test_signup_and_login_roundtrip(monkeypatch):
    fake = FakeUsersCollection()
    monkeypatch.setattr(auth, "users_collection", fake)

    created = await auth.create_user("alice", "alice@example.com", "secret123", auth.UserRole.SUPPLIER)
    assert created.username == "alice"

    authed = await auth.authenticate_user("alice", "secret123")
    assert authed is not None
    assert authed.role == auth.UserRole.SUPPLIER

    authed_by_email = await auth.authenticate_user("alice@example.com", "secret123")
    assert authed_by_email is not None
    assert authed_by_email.username == "alice"


@pytest.mark.asyncio
async def test_signup_duplicate_is_rejected(monkeypatch):
    fake = FakeUsersCollection()
    monkeypatch.setattr(auth, "users_collection", fake)
    await auth.create_user("bob", "bob@example.com", "secret123", auth.UserRole.BUYER)

    with pytest.raises(HTTPException) as exc:
        await auth.create_user("bob", "other@example.com", "secret123", auth.UserRole.BUYER)
    assert exc.value.status_code == 409


def test_user_signup_role_normalization():
    from models import UserSignup

    payload = UserSignup(
        username="johnsmith",
        email="john@example.com",
        password="secret123",
        role="SUPPLIER",
    )
    assert payload.role == "supplier"


@pytest.mark.asyncio
async def test_login_error_messages(monkeypatch):
    fake = FakeUsersCollection()
    monkeypatch.setattr(auth, "users_collection", fake)
    await auth.create_user("charlie", "charlie@example.com", "secret123", auth.UserRole.SUPPLIER)

    not_found = await auth.get_login_error("nobody", "whatever")
    assert not_found == "User or email does not exist"

    wrong_password = await auth.get_login_error("charlie", "badpass")
    assert wrong_password == "Incorrect password"


@pytest.mark.asyncio
async def test_get_login_error_success_returns_none(monkeypatch):
    fake = FakeUsersCollection()
    monkeypatch.setattr(auth, "users_collection", fake)
    await auth.create_user("diana", "diana@example.com", "secret123", auth.UserRole.BUYER)

    error = await auth.get_login_error("diana", "secret123")
    assert error is None


@pytest.mark.asyncio
async def test_authenticate_user_wrong_password_returns_none(monkeypatch):
    fake = FakeUsersCollection()
    monkeypatch.setattr(auth, "users_collection", fake)
    await auth.create_user("ed", "ed@example.com", "secret123", auth.UserRole.SUPPLIER)

    authed = await auth.authenticate_user("ed", "wrong-password")
    assert authed is None


def test_hash_password_uses_bcrypt_sha256_prefix():
    password_hash = auth.hash_password("secret123")
    assert password_hash.startswith("$bcrypt-sha256$")
