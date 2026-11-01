from __future__ import annotations

from dataclasses import dataclass
import socket


COMMON_PORTS = (80, 554, 8554, 8899, 5000, 8000, 8080, 10000, 32100, 65531)


@dataclass(frozen=True)
class PortProbe:
    port: int
    open: bool
    error: str = ""


def probe_tcp_ports(host: str, ports: list[int] | tuple[int, ...] = COMMON_PORTS, *, timeout: float = 0.4) -> list[PortProbe]:
    results: list[PortProbe] = []
    for port in ports:
        try:
            with socket.create_connection((host, int(port)), timeout=timeout):
                results.append(PortProbe(port=int(port), open=True))
        except OSError as exc:
            results.append(PortProbe(port=int(port), open=False, error=str(exc)))
    return results


def rtsp_candidates(host: str, *, user: str = "admin", password: str = "admin") -> list[str]:
    auth = f"{user}:{password}@"
    return [
        f"rtsp://{auth}{host}:8554/profile0",
        f"rtsp://{auth}{host}:8554/profile1",
        f"rtsp://{auth}{host}:554/profile0",
        f"rtsp://{auth}{host}:554/profile1",
        f"rtsp://{auth}{host}:554/stream1",
        f"rtsp://{auth}{host}:554/live/ch00_0",
        f"rtsp://{auth}{host}:554/11",
    ]
