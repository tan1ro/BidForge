from pathlib import Path
import sys

import pytest
from fastapi import HTTPException, WebSocketDisconnect

sys.path.append(str(Path(__file__).resolve().parents[1]))

import auth
import routes


class DummyWebSocket:
    def __init__(self, subprotocols):
        self.scope = {"subprotocols": subprotocols}
        self.closed = False
        self.close_code = None
        self.close_reason = None

    async def close(self, code=None, reason=None):
        self.closed = True
        self.close_code = code
        self.close_reason = reason

    async def receive_text(self):
        raise WebSocketDisconnect()


@pytest.mark.asyncio
async def test_ws_rejects_missing_token(monkeypatch):
    ws = DummyWebSocket([])
    await routes.rfq_socket(ws, "rfq-1")
    assert ws.closed is True
    assert "Missing auth token" in (ws.close_reason or "")


@pytest.mark.asyncio
async def test_ws_rejects_invalid_token(monkeypatch):
    ws = DummyWebSocket(["token", "bad-token"])

    def fake_user_from_token(_):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    monkeypatch.setattr(routes, "user_from_token", fake_user_from_token)

    await routes.rfq_socket(ws, "rfq-1")
    assert ws.closed is True
    assert "Invalid auth token" in (ws.close_reason or "")


@pytest.mark.asyncio
async def test_ws_accepts_valid_token(monkeypatch):
    ws = DummyWebSocket(["token", "good-token"])
    called = {"connect": 0}

    def fake_user_from_token(_):
        return auth.UserPrincipal(username="supplier1", role=auth.UserRole.SUPPLIER)

    class FakeUsersCollection:
        async def find_one(self, query):
            if query.get("username") == "supplier1":
                return {"username": "supplier1"}
            return None

    async def fake_connect(rfq_id, websocket, subprotocol=None):
        called["connect"] += 1
        assert rfq_id == "rfq-1"
        assert websocket is ws
        assert subprotocol == "token"

    monkeypatch.setattr(routes, "user_from_token", fake_user_from_token)
    monkeypatch.setattr(routes, "users_collection", FakeUsersCollection())
    monkeypatch.setattr(routes.ws_manager, "connect", fake_connect)
    monkeypatch.setattr(routes.ws_manager, "disconnect", lambda *_args, **_kwargs: None)

    await routes.rfq_socket(ws, "rfq-1")
    assert called["connect"] == 1
