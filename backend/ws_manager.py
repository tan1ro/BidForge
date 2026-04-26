from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, rfq_id: str, websocket: WebSocket):
        await websocket.accept()
        self._rooms[rfq_id].add(websocket)

    def disconnect(self, rfq_id: str, websocket: WebSocket):
        if rfq_id in self._rooms:
            self._rooms[rfq_id].discard(websocket)
            if not self._rooms[rfq_id]:
                del self._rooms[rfq_id]

    async def broadcast(self, rfq_id: str, payload: dict):
        dead = []
        for socket in self._rooms.get(rfq_id, set()):
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self.disconnect(rfq_id, socket)


ws_manager = ConnectionManager()
