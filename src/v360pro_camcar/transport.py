from __future__ import annotations

import socket


def send_tcp(host: str, port: int, data: bytes, *, timeout: float = 3.0) -> int:
    with socket.create_connection((host, int(port)), timeout=timeout) as sock:
        sock.sendall(data)
    return len(data)
